// tests/ch08/post-set.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { PostSetService } from '../../src/ch08/post-set.service.js';
import { prisma } from '../../src/shared/prisma.js';

/** 게시글별 좋아요 사용자 Set의 중복 제거, 조회, 취소를 검증합니다. */
describe('PostSetService', () => {
  const service = new PostSetService();
  let authorId: number;
  let likerId: number;
  let postId: number;

  // 좋아요 대상 게시글과 사용자가 DB에 존재하도록 테스트 데이터를 준비합니다.
  beforeEach(async () => {
    const author = await prisma.user.create({
      data: { email: 'set-author@example.com', name: '작성자' },
    });
    const liker = await prisma.user.create({
      data: { email: 'set-liker@example.com', name: '좋아요 사용자' },
    });
    const post = await prisma.post.create({
      data: {
        title: 'Redis Set',
        content: '좋아요 테스트 게시글',
        authorId: author.id,
        status: 'PUBLISHED',
      },
    });

    authorId = author.id;
    likerId = liker.id;
    postId = post.id;
  });

  it('게시글 좋아요를 추가하고 중복 좋아요는 한 번만 집계한다', async () => {
    const first = await service.likePost(postId, likerId);
    const duplicate = await service.likePost(postId, likerId);

    expect(first).toEqual({ postId, userId: likerId, liked: true, likeCount: 1 });
    expect(duplicate).toEqual({ postId, userId: likerId, liked: true, likeCount: 1 });
    await expect(service.isPostLikedByUser(postId, likerId)).resolves.toBe(true);
  });

  it('여러 사용자의 좋아요 수와 사용자 목록을 반환한다', async () => {
    await service.likePost(postId, authorId);
    await service.likePost(postId, likerId);

    const summary = await service.getPostLikeSummary(postId);
    expect(summary.postId).toBe(postId);
    expect(summary.likeCount).toBe(2);
    expect(summary.likedUserIds).toEqual(expect.arrayContaining([authorId, likerId]));
  });

  it('좋아요를 취소하고 중복 취소를 안전하게 처리한다', async () => {
    await service.likePost(postId, likerId);

    const first = await service.unlikePost(postId, likerId);
    const duplicate = await service.unlikePost(postId, likerId);

    expect(first).toEqual({ postId, userId: likerId, liked: false, likeCount: 0 });
    expect(duplicate).toEqual({ postId, userId: likerId, liked: false, likeCount: 0 });
    await expect(service.isPostLikedByUser(postId, likerId)).resolves.toBe(false);
  });

  it('존재하지 않는 게시글이나 사용자의 좋아요 추가를 거부한다', async () => {
    await expect(service.likePost(999_999, likerId)).rejects.toThrow();
    await expect(service.likePost(postId, 999_999)).rejects.toThrow();
    await expect(service.getPostLikeCount(postId)).resolves.toBe(0);
  });

  it('게시글 좋아요 Set 전체를 삭제한다', async () => {
    await service.likePost(postId, likerId);

    await service.deletePostLikes(postId);

    await expect(service.getPostLikeCount(postId)).resolves.toBe(0);
    await expect(service.getPostLikeSummary(postId)).resolves.toEqual({
      postId,
      likeCount: 0,
      likedUserIds: [],
    });
  });
});
