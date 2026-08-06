import { beforeEach, describe, expect, it } from 'vitest';

import { PostService } from '../../src/ch05/post.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

describe('PostService', () => {
  const service = new PostService();
  let authorId: number;

  beforeEach(async () => {
    const author = await prisma.user.create({
      data: {
        email: 'post-author@example.com',
        name: '게시글 작성자',
      },
    });
    authorId = author.id;
  });

  it('게시글을 기본 DRAFT 상태로 생성하고 조회한다', async () => {
    const created = await service.createPost({
      title: 'Redis 조회수 실습',
      content: '게시글 본문',
      authorId,
    });

    expect(created).toMatchObject({
      title: 'Redis 조회수 실습',
      authorId,
      status: 'DRAFT',
      viewCount: 0,
    });
    await expect(service.getPostById(created.id)).resolves.toMatchObject({ id: created.id });
  });

  it('게시글 상세 조회마다 Redis 조회수를 원자적으로 증가시킨다', async () => {
    const post = await service.createPost({
      title: '조회수 증가',
      content: '본문',
      authorId,
      status: 'PUBLISHED',
    });

    const first = await service.getPostDetailAndIncreaseViewCount(post.id);
    const second = await service.getPostDetailAndIncreaseViewCount(post.id);

    expect(first?.redisViewCount).toBe(1);
    expect(second?.redisViewCount).toBe(2);
    await expect(service.getRedisViewCount(post.id)).resolves.toBe(2);

    // Redis에 누적하는 동안 DB의 원본 조회수는 변경되지 않습니다.
    await expect(prisma.post.findUnique({ where: { id: post.id } })).resolves.toMatchObject({
      viewCount: 0,
    });
  });

  it('Redis 조회수를 DB에 합산한 뒤 카운터를 삭제한다', async () => {
    const post = await service.createPost({
      title: '조회수 동기화',
      content: '본문',
      authorId,
    });
    await service.increaseViewCount(post.id);
    await service.increaseViewCount(post.id);
    await service.increaseViewCount(post.id);

    const synced = await service.syncViewCountToDatabase(post.id);

    expect(synced?.viewCount).toBe(3);
    await expect(service.getRedisViewCount(post.id)).resolves.toBe(0);
    await expect(service.syncViewCountToDatabase(post.id)).resolves.toBeNull();
  });

  it('DB 반영에 실패하면 가져온 Redis 조회수를 복구한다', async () => {
    const missingPostId = -1;
    const key = RedisKey.string.postViewCount(missingPostId);
    await redis.set(key, '4');

    await expect(service.syncViewCountToDatabase(missingPostId)).rejects.toThrow();
    await expect(service.getRedisViewCount(missingPostId)).resolves.toBe(4);
  });

  it('존재하지 않는 게시글은 조회수를 만들지 않고 null을 반환한다', async () => {
    await expect(service.getPostDetailAndIncreaseViewCount(-1)).resolves.toBeNull();
    await expect(service.getRedisViewCount(-1)).resolves.toBe(0);
  });
});
