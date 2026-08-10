import { randomUUID } from 'node:crypto';

import { prisma } from '../shared/prisma.js';
import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import type { Prisma } from '../generated/prisma/client';
import { assertFiniteScore, isValidLimit } from './zset-validation.js';

/**
 * 포인트 랭킹 응답에 필요한 사용자 필드를 DB에서 조회하는 Prisma select 옵션입니다.
 *
 * 1. Redis Sorted Set에는 userId와 포인트 score만 저장합니다.
 * 2. 이름, 이메일, 상태 등 사용자 원본 데이터는 DB에서 조회합니다.
 * 3. 랭킹 응답에 필요한 필드만 선택해 불필요한 데이터 조회를 줄입니다.
 *
 * 실습 포인트:
 * Redis는 랭킹 인덱스 역할을 맡고 DB는 사용자 원본 데이터 저장소 역할을 맡습니다.
 */
const UserRankingSelect: Prisma.UserSelect = {
  id: true,
  email: true,
  name: true,
  point: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

/** 사용자 정보와 Redis 랭킹 점수를 함께 반환할 때 사용하는 응답 데이터입니다. */
export type UserRankingOutput = {
  id: number;
  email: string;
  name: string;
  point: number;
  rankingScore: number;
  rank: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * DB 사용자 정보와 Redis 랭킹 정보를 하나의 응답 데이터로 변환합니다.
 *
 * 1. DB에서 조회한 사용자 필드를 응답 형태로 복사합니다.
 * 2. Redis에서 조회한 rankingScore와 rank를 결합합니다.
 * 3. Date 값을 JSON 응답에 적합한 ISO 문자열로 변환합니다.
 */
function toUserRankingOutput(
  user: {
    id: number;
    email: string;
    name: string;
    point: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  rankingScore: number,
  rank: number,
): UserRankingOutput {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    point: user.point,
    rankingScore,
    rank,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** DB 포인트를 원본으로 삼고 Redis Sorted Set을 조회용 랭킹 인덱스로 관리하는 서비스입니다. */
export class UserZSetService {
  /**
   * 사용자의 현재 포인트를 Redis 랭킹 점수로 저장합니다.
   *
   * 1. userId를 문자열로 변환해 Sorted Set의 member로 사용합니다.
   * 2. 현재 point를 member의 score로 저장합니다.
   * 3. 같은 member가 이미 있으면 최신 score로 갱신합니다.
   *
   * 실습 포인트:
   * ZADD를 사용하면 신규 사용자의 랭킹 등록과 기존 사용자의 점수 갱신을 같은 흐름으로 처리할 수 있습니다.
   */
  async setUserPointRankingScore(userId: number, point: number): Promise<void> {
    // Redis에 기록하기 전에 NaN과 Infinity를 차단합니다.
    assertFiniteScore(point, '사용자 랭킹 점수');

    const key = RedisKey.zset.userPointRanking();

    // 사용자 포인트 랭킹에 사용자와 점수를 저장합니다.
    // 새 사용자를 추가하거나 기존 점수를 갱신하고 새로 추가된 사용자 수를 반환합니다.
    await redis.zAdd(key, {
      value: String(userId),
      score: point,
    });
  }

  /**
   * DB의 사용자 포인트를 증가시키고 Redis 랭킹에 반영합니다.
   *
   * 1. DB의 User.point를 증가시킵니다.
   * 2. 증가된 최신 point 값을 Redis Sorted Set에 반영합니다.
   *
   * 실습 포인트:
   * 포인트의 원본은 DB입니다.
   * Redis는 빠른 랭킹 조회를 위한 보조 인덱스로 사용합니다.
   */
  async increaseUserPoint(userId: number, point: number) {
    // 잘못된 값으로 DB와 Redis 갱신을 시작하지 않도록 가장 먼저 검증합니다.
    assertFiniteScore(point, '증가할 사용자 포인트');

    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        point: {
          increment: point,
        },
      },
      select: UserRankingSelect,
    });

    // DB를 원본으로 사용하므로 DB가 반환한 최신 point를 Redis에 저장합니다.
    await this.setUserPointRankingScore(user.id, user.point);

    return user;
  }

  /**
   * 포인트가 높은 사용자 TOP N을 상세 정보와 함께 조회합니다.
   *
   * 1. Redis에서 score가 높은 순서로 사용자 ID와 점수를 조회합니다.
   * 2. 조회한 사용자 ID에 해당하는 상세 정보를 DB에서 가져옵니다.
   * 3. DB 조회 결과를 ID 기준 Map으로 만들어 사용자를 빠르게 찾습니다.
   * 4. Redis의 랭킹 순서를 유지해 사용자 정보, 점수, 순위를 반환합니다.
   *
   * 실습 포인트:
   * Redis의 정렬 결과를 기준으로 응답을 조립해야 DB 조회 순서와 관계없이 랭킹 순서를 유지할 수 있습니다.
   */
  async getTopUserPointRanking(limit = 10): Promise<UserRankingOutput[]> {
    // limit 0이 ZRANGE 0 -1로 변환되어 전체 랭킹을 반환하지 않도록 검사합니다.
    if (!isValidLimit(limit)) {
      return [];
    }

    const key = RedisKey.zset.userPointRanking();

    // 사용자 포인트 랭킹에서 상위 사용자를 점수와 함께 조회합니다.
    // REV 옵션으로 점수가 높은 순서의 지정 범위를 반환하며, 사용자가 없으면 빈 배열을 반환합니다.
    const rankingItems = await redis.zRangeWithScores(key, 0, limit - 1, {
      REV: true,
    });

    if (rankingItems.length === 0) {
      return [];
    }

    // Redis 문자열 member를 Prisma Int ID로 조회할 수 있도록 숫자로 변환합니다.
    const userIds = rankingItems.map((item) => Number(item.value));

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: UserRankingSelect,
    });

    // DB 조회 순서와 관계없이 Redis 랭킹 순서로 결과를 조립하기 위한 Map입니다.
    const userMap = new Map(users.map((user) => [user.id, user]));

    return rankingItems
      .map((item, index) => {
        const userId = Number(item.value);
        const user = userMap.get(userId);

        // DB에서 삭제된 사용자의 오래된 Redis member는 응답에서 제외합니다.
        if (!user) {
          return null;
        }

        return toUserRankingOutput(user, item.score, index + 1);
      })
      .filter((user): user is UserRankingOutput => user !== null);
  }

  /**
   * 특정 사용자의 현재 포인트 순위를 조회합니다.
   *
   * 1. userId를 Sorted Set에서 사용하는 문자열 member로 변환합니다.
   * 2. ZREVRANK로 score가 높은 순서의 위치를 조회합니다.
   * 3. Redis의 0 기반 순위에 1을 더해 사용자용 순위로 변환합니다.
   *
   * 참고:
   * 랭킹에 사용자가 없으면 null을 반환합니다.
   */
  async getUserPointRank(userId: number): Promise<number | null> {
    const key = RedisKey.zset.userPointRanking();
    const member = String(userId);

    // 사용자 포인트 랭킹에서 점수가 높은 순서의 현재 위치를 조회합니다.
    // 0부터 시작하는 순위를 반환하며, 사용자가 랭킹에 없으면 null을 반환합니다.
    const zeroBasedRank = await redis.zRevRank(key, member);

    if (zeroBasedRank === null) {
      return null;
    }

    return zeroBasedRank + 1;
  }

  /**
   * 특정 사용자의 현재 Redis 랭킹 점수를 조회합니다.
   *
   * 1. userId를 Sorted Set에서 사용하는 문자열 member로 변환합니다.
   * 2. ZSCORE로 해당 member의 score를 조회합니다.
   * 3. 랭킹에 사용자가 없으면 0을 반환합니다.
   *
   * 참고:
   * 이 값은 Redis에 저장된 랭킹 점수이며 DB의 현재 point와 일시적으로 다를 수 있습니다.
   */
  async getUserPointRankingScore(userId: number): Promise<number> {
    const key = RedisKey.zset.userPointRanking();
    const member = String(userId);

    // 사용자 포인트 랭킹에서 사용자의 현재 점수를 조회합니다.
    // 사용자가 랭킹에 없으면 null을 반환합니다.
    const score = await redis.zScore(key, member);

    return score ?? 0;
  }

  /**
   * DB의 현재 포인트를 기준으로 Redis 사용자 랭킹을 재구성합니다.
   *
   * 1. DB에서 모든 사용자 id/point를 조회합니다.
   * 2. 임시 Redis Sorted Set에 DB point 기준 랭킹을 구성합니다.
   * 3. 완성된 임시 key를 기존 랭킹 key로 원자적으로 교체합니다.
   *
   * 실습 포인트:
   * Redis 랭킹이 유실되거나 오래되었을 때 DB를 기준으로 복구할 수 있습니다.
   */
  async syncUserPointRankingFromDatabase(): Promise<void> {
    const key = RedisKey.zset.userPointRanking();
    // 동시에 실행되는 동기화 작업이 같은 임시 key를 공유하지 않도록 UUID를 붙입니다.
    const temporaryKey = `${key}:sync:${randomUUID()}`;

    // Redis 랭킹을 복구할 기준 데이터인 모든 사용자 ID와 포인트를 DB에서 읽습니다.
    const users = await prisma.user.findMany({
      select: {
        id: true,
        point: true,
      },
    });

    if (users.length === 0) {
      // DB가 비어 있으면 기존 랭킹도 삭제해 두 저장소의 상태를 맞춥니다.
      await redis.del(key);
      return;
    }

    try {
      // 기존 랭킹은 유지한 채 임시 Sorted Set을 먼저 완성합니다.
      await redis.zAdd(
        temporaryKey,
        users.map((user) => ({
          value: String(user.id),
          score: user.point,
        })),
      );
      // RENAME은 완성된 임시 key로 기존 key를 한 번에 교체해 빈 랭킹 노출을 막습니다.
      await redis.rename(temporaryKey, key);
    } catch (error) {
      // 구성이나 교체가 실패하면 남아 있을 수 있는 임시 key를 정리하고 원래 오류를 전달합니다.
      await redis.del(temporaryKey);
      throw error;
    }
  }

  /**
   * 특정 사용자를 포인트 랭킹에서 제거합니다.
   *
   * 1. userId를 Sorted Set에서 사용하는 문자열 member로 변환합니다.
   * 2. ZREM으로 해당 member와 score를 함께 제거합니다.
   *
   * 참고:
   * 사용자가 랭킹에 없어도 ZREM은 오류를 발생시키지 않습니다.
   */
  async removeUserFromPointRanking(userId: number): Promise<void> {
    const key = RedisKey.zset.userPointRanking();

    // 사용자 포인트 랭킹에서 지정한 사용자를 제거합니다.
    // 사용자와 점수를 함께 제거하고 제거한 수를 반환하며, 사용자가 없으면 0을 반환합니다.
    await redis.zRem(key, String(userId));
  }

  /**
   * 사용자 포인트 랭킹 전체를 초기화합니다.
   *
   * 1. 사용자 포인트 랭킹에 사용하는 Redis key를 가져옵니다.
   * 2. DEL로 key를 삭제해 모든 member와 score를 제거합니다.
   *
   * 참고:
   * 테스트 데이터를 정리하거나 랭킹을 새로 집계할 때 사용할 수 있습니다.
   */
  async clearUserPointRanking(): Promise<void> {
    const key = RedisKey.zset.userPointRanking();

    // 사용자 포인트 랭킹 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
