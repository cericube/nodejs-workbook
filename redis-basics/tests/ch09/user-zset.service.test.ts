// tests/ch09/user-zset.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { UserZSetService } from '../../src/ch09/user-zset.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

/** DB 포인트와 Redis 사용자 랭킹의 동기화, 순위 및 경계값을 검증합니다. */
describe('UserZSetService', () => {
  const service = new UserZSetService();
  let firstUserId: number;
  let secondUserId: number;

  beforeEach(async () => {
    // DB를 포인트 원본으로 사용하는 서비스이므로 각 테스트에 사용자 원본 데이터를 준비합니다.
    const firstUser = await prisma.user.create({
      data: { email: 'zset-first@example.com', name: '첫 번째 사용자', point: 10 },
    });
    const secondUser = await prisma.user.create({
      data: { email: 'zset-second@example.com', name: '두 번째 사용자', point: 20 },
    });

    firstUserId = firstUser.id;
    secondUserId = secondUser.id;
  });

  it('DB 포인트를 증가시키고 Redis 랭킹에도 반영한다', async () => {
    await service.setUserPointRankingScore(firstUserId, 10);
    await service.setUserPointRankingScore(secondUserId, 20);

    // DB가 반환한 최신 point가 Redis score에도 동일하게 반영되어야 합니다.
    const updated = await service.increaseUserPoint(firstUserId, 15);

    expect(updated.point).toBe(25);
    await expect(service.getUserPointRankingScore(firstUserId)).resolves.toBe(25);
    await expect(service.getUserPointRank(firstUserId)).resolves.toBe(1);
  });

  it('점수가 높은 사용자부터 DB 정보와 결합해 반환한다', async () => {
    await service.setUserPointRankingScore(firstUserId, 10);
    await service.setUserPointRankingScore(secondUserId, 20);

    // DB 조회 순서와 무관하게 Redis score 내림차순으로 응답을 조립해야 합니다.
    const ranking = await service.getTopUserPointRanking(2);

    expect(ranking.map((user) => user.id)).toEqual([secondUserId, firstUserId]);
    expect(ranking.map((user) => user.rank)).toEqual([1, 2]);
  });

  it.each([0, -1, 1.5])('유효하지 않은 limit %s에는 빈 배열을 반환한다', async (limit) => {
    await service.setUserPointRankingScore(firstUserId, 10);

    // limit 0이 전체 랭킹 조회로 해석되지 않도록 경계값을 고정합니다.
    await expect(service.getTopUserPointRanking(limit)).resolves.toEqual([]);
  });

  it('DB의 현재 포인트로 기존 Redis 랭킹을 교체한다', async () => {
    const key = RedisKey.zset.userPointRanking();
    // DB에 없는 오래된 member를 넣어 임시 key와 RENAME 기반 전체 교체를 검증합니다.
    await redis.zAdd(key, { value: '999999', score: 999 });

    await service.syncUserPointRankingFromDatabase();

    await expect(redis.zScore(key, '999999')).resolves.toBeNull();
    await expect(service.getUserPointRankingScore(firstUserId)).resolves.toBe(10);
    await expect(service.getUserPointRankingScore(secondUserId)).resolves.toBe(20);
  });

  it('유한하지 않은 포인트를 Redis와 DB에 반영하지 않는다', async () => {
    // 입력 검증 실패가 DB 변경보다 먼저 발생하는지도 원본 point로 확인합니다.
    await expect(service.setUserPointRankingScore(firstUserId, Infinity)).rejects.toThrow(
      '유한한 숫자',
    );
    await expect(service.increaseUserPoint(firstUserId, Number.NaN)).rejects.toThrow('유한한 숫자');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: firstUserId } });
    expect(user.point).toBe(10);
  });

  it('사용자를 제거하고 전체 랭킹을 초기화한다', async () => {
    await service.setUserPointRankingScore(firstUserId, 10);
    await service.setUserPointRankingScore(secondUserId, 20);

    // 개별 member 제거 후 전체 key 초기화가 각각 독립적으로 동작해야 합니다.
    await service.removeUserFromPointRanking(firstUserId);
    await expect(service.getUserPointRank(firstUserId)).resolves.toBeNull();

    await service.clearUserPointRanking();
    await expect(service.getTopUserPointRanking()).resolves.toEqual([]);
  });
});
