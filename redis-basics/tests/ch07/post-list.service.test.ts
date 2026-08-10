// tests/ch07/post-list.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { PostListService } from '../../src/ch07/post-list.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

/** DB 게시글과 Redis 최근 조회 순서가 함께 동작하는지 검증합니다. */
describe('PostListService', () => {
  const service = new PostListService();
  let userId: number;

  // 게시글의 author 외래 키를 만족하도록 각 테스트마다 작성자를 먼저 생성합니다.
  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: 'post-list@example.com',
        name: '최근 게시글 사용자',
      },
    });
    userId = user.id;
  });

  /** 테스트마다 필요한 게시글을 같은 형태로 생성하기 위한 보조 함수입니다. */
  async function createPost(title: string) {
    return prisma.post.create({
      data: {
        title,
        content: `${title} 내용`,
        authorId: userId,
        status: 'PUBLISHED',
      },
    });
  }

  it('게시글을 조회하고 최근 본 게시글 ID를 기록한다', async () => {
    const post = await createPost('Redis List');

    const result = await service.getPostAndAddRecentViewedPost(userId, post.id);

    expect(result).toMatchObject({
      id: post.id,
      title: 'Redis List',
      authorId: userId,
      status: 'PUBLISHED',
    });
    expect(Number.isNaN(Date.parse(result?.createdAt ?? ''))).toBe(false);
    await expect(service.getRecentViewedPostIds(userId)).resolves.toEqual([post.id]);
  });

  it('존재하지 않는 게시글은 최근 본 목록에 기록하지 않는다', async () => {
    await expect(service.getPostAndAddRecentViewedPost(userId, 999_999)).resolves.toBeNull();
    await expect(service.getRecentViewedPostIds(userId)).resolves.toEqual([]);
  });

  it('최근 본 게시글을 최신순으로 유지하고 중복 ID를 맨 앞으로 옮긴다', async () => {
    const first = await createPost('첫 번째');
    const second = await createPost('두 번째');

    await service.addRecentViewedPost(userId, first.id);
    await service.addRecentViewedPost(userId, second.id);
    await service.addRecentViewedPost(userId, first.id);

    await expect(service.getRecentViewedPostIds(userId)).resolves.toEqual([first.id, second.id]);
  });

  it('지정한 개수만 남기고 오래된 조회 기록을 제거한다', async () => {
    const first = await createPost('첫 번째');
    const second = await createPost('두 번째');
    const third = await createPost('세 번째');

    await service.addRecentViewedPost(userId, first.id, 2);
    await service.addRecentViewedPost(userId, second.id, 2);
    await service.addRecentViewedPost(userId, third.id, 2);

    await expect(service.getRecentViewedPostIds(userId)).resolves.toEqual([third.id, second.id]);
  });

  it('동시에 같은 게시글을 기록해도 중복 ID를 남기지 않는다', async () => {
    const post = await createPost('동시 조회 게시글');

    // MULTI/EXEC이 중복 제거부터 개수 제한까지 하나의 작업으로 실행하는지 확인합니다.
    await Promise.all(
      Array.from({ length: 5 }, () => service.addRecentViewedPost(userId, post.id)),
    );

    const key = RedisKey.list.postRecentViews(userId);
    await expect(redis.lRange(key, 0, -1)).resolves.toEqual([String(post.id)]);
  });

  it('Redis 순서대로 DB 상세 정보를 반환하고 삭제된 게시글은 제외한다', async () => {
    const deleted = await createPost('삭제될 게시글');
    const remained = await createPost('남은 게시글');
    await service.addRecentViewedPost(userId, remained.id);
    await service.addRecentViewedPost(userId, deleted.id);

    // Redis에는 ID가 남아 있지만 DB 원본만 삭제된 상황을 재현합니다.
    await prisma.post.delete({ where: { id: deleted.id } });

    const posts = await service.getRecentViewedPosts(userId);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: remained.id, title: '남은 게시글' });
  });

  it('최근 본 게시글 목록 전체를 삭제한다', async () => {
    const post = await createPost('삭제할 조회 기록');
    await service.addRecentViewedPost(userId, post.id);

    await service.clearRecentViewedPosts(userId);

    await expect(service.getRecentViewedPostIds(userId)).resolves.toEqual([]);
  });
});
