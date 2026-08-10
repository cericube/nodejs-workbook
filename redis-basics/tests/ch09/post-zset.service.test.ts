// tests/ch09/post-zset.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { PostZSetService } from '../../src/ch09/post-zset.service.js';
import { prisma } from '../../src/shared/prisma.js';

/** 게시글 인기 점수, 순위, TOP N 조회와 입력 경계값을 검증합니다. */
describe('PostZSetService', () => {
  const service = new PostZSetService();
  let firstPostId: number;
  let secondPostId: number;

  beforeEach(async () => {
    // 인기 랭킹 결과가 Redis ID와 DB 상세 정보를 결합할 수 있도록 원본 게시글을 준비합니다.
    const author = await prisma.user.create({
      data: { email: 'zset-post-author@example.com', name: '랭킹 작성자' },
    });
    const firstPost = await prisma.post.create({
      data: {
        title: '첫 번째 게시글',
        content: '첫 번째 본문',
        authorId: author.id,
        status: 'PUBLISHED',
      },
    });
    const secondPost = await prisma.post.create({
      data: {
        title: '두 번째 게시글',
        content: '두 번째 본문',
        authorId: author.id,
        status: 'PUBLISHED',
      },
    });

    firstPostId = firstPost.id;
    secondPostId = secondPost.id;
  });

  it('게시글 점수를 누적하고 높은 점수부터 순위를 반환한다', async () => {
    // 같은 member에 ZINCRBY를 반복하면 member가 중복되지 않고 score만 누적됩니다.
    await service.increasePostRankingScore(firstPostId, 2);
    await service.increasePostRankingScore(firstPostId, 3);
    await service.increasePostRankingScore(secondPostId, 10);

    await expect(service.getPostRankingScore(firstPostId)).resolves.toBe(5);
    await expect(service.getPostRank(secondPostId)).resolves.toBe(1);
    await expect(service.getPostRank(firstPostId)).resolves.toBe(2);
  });

  it('Redis 랭킹 순서대로 DB 게시글 정보를 결합한다', async () => {
    await service.increasePostRankingScore(firstPostId, 5);
    await service.increasePostRankingScore(secondPostId, 10);

    // Prisma findMany의 반환 순서가 아니라 Redis의 내림차순 랭킹이 유지되어야 합니다.
    const posts = await service.getPopularPosts(2);

    expect(posts.map((post) => post.id)).toEqual([secondPostId, firstPostId]);
    expect(posts.map((post) => post.rankingScore)).toEqual([10, 5]);
    expect(posts.map((post) => post.rank)).toEqual([1, 2]);
  });

  it.each([0, -1, 1.5])('유효하지 않은 limit %s에는 빈 배열을 반환한다', async (limit) => {
    await service.increasePostRankingScore(firstPostId, 1);

    // 특히 limit 0이 ZRANGE 0 -1로 변환되어 전체 조회되는 회귀를 방지합니다.
    await expect(service.getPopularPosts(limit)).resolves.toEqual([]);
  });

  it('유한하지 않은 점수를 거부한다', async () => {
    // Redis 명령을 보내기 전에 JavaScript의 특수 숫자 값을 검증해야 합니다.
    await expect(service.increasePostRankingScore(firstPostId, Number.NaN)).rejects.toThrow(
      '유한한 숫자',
    );
    await expect(service.increasePostRankingScore(firstPostId, Infinity)).rejects.toThrow(
      '유한한 숫자',
    );
  });

  it('게시글을 랭킹에서 제거하고 전체 랭킹을 초기화한다', async () => {
    await service.increasePostRankingScore(firstPostId, 1);
    await service.increasePostRankingScore(secondPostId, 2);

    // 개별 ZREM과 전체 key DEL의 동작을 한 테스트에서 순서대로 확인합니다.
    await service.removePostFromRanking(firstPostId);
    await expect(service.getPostRank(firstPostId)).resolves.toBeNull();

    await service.clearPostRanking();
    await expect(service.getPopularPosts()).resolves.toEqual([]);
  });
});
