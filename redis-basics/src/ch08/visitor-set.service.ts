import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/**
 * 로그인 사용자의 일일 방문 기록 후 반환하는 상태 데이터입니다.
 *
 * Redis에는 userId를 문자열 member로 저장하고, 응답에는 원래 number userId를 담습니다.
 */
export type DailyVisitorOutput = {
  date: string;
  userId: number;
  isNewVisitor: boolean;
  visitorCount: number;
};

/**
 * 특정 날짜의 로그인 방문자 Set을 요약한 응답 데이터입니다.
 *
 * userIds는 Redis Set의 member를 number로 변환하고 정렬한 목록입니다.
 */
export type DailyVisitorSummaryOutput = {
  date: string;
  visitorCount: number;
  userIds: number[];
};

/**
 * Redis Set에 저장할 사용자 ID member를 만듭니다.
 *
 * 1. userId를 입력받습니다.
 * 2. Redis Set member로 저장할 수 있도록 문자열로 변환합니다.
 *
 * 실습 포인트:
 * Redis Set은 문자열 member를 기준으로 중복 여부를 판단하므로, 같은 userId는 하루에 한 번만 저장됩니다.
 */
function createVisitorMember(userId: number): string {
  return String(userId);
}

export class VisitorSetService {
  /**
   * 로그인 사용자의 일일 방문을 날짜별 Redis Set에 기록합니다.
   *
   * 1. 날짜 기준 Redis Set key를 만듭니다.
   * 2. userId를 Set member 문자열로 변환합니다.
   * 3. SADD로 사용자 ID를 추가하고, 추가 결과로 신규 방문자인지 판단합니다.
   * 4. EXPIRE NX로 TTL이 없는 Set에만 만료 시간을 설정합니다.
   * 5. SCARD로 현재 방문자 수를 조회합니다.
   *
   * 실습 포인트:
   * Redis Set은 중복 member를 허용하지 않으므로 로그인 사용자 기준 일일 중복 방문 제거에 적합합니다.
   * SADD, EXPIRE NX, SCARD를 MULTI/EXEC으로 묶어 다른 명령이 처리 중간에 끼어들지 못하게 합니다.
   * EXPIRE NX는 TTL이 없을 때만 설정하므로 기존 만료 시간이 방문 기록마다 연장되지 않습니다.
   *
   * 참고:
   * 이 예제는 IP나 브라우저 쿠키가 아니라 로그인 사용자 ID만 방문자 식별 기준으로 사용합니다.
   */
  async addDailyVisitor(date: string, userId: number): Promise<DailyVisitorOutput> {
    const key = RedisKey.set.dailyVisitors(date);
    const member = createVisitorMember(userId);

    // 방문자 추가, 최초 TTL 설정, 방문자 수 조회를 하나의 Transaction으로 실행합니다.
    // NX 옵션은 기존 TTL을 덮어쓰지 않으며, TTL 없는 비정상 Set도 다시 만료 가능 상태로 복구합니다.
    const transactionResult = await redis
      .multi()
      .sAdd(key, member)
      .expire(key, 60 * 60 * 24 * 2, 'NX')
      .sCard(key)
      .exec();

    // node-redis는 Transaction 결과를 여러 Redis 응답의 공용 타입으로 반환하므로
    // SADD와 SCARD 위치의 값이 실제 숫자인지 확인한 뒤 서비스 결과에 사용합니다.
    const addedCount = transactionResult[0];
    const visitorCount = transactionResult[2];

    if (typeof addedCount !== 'number' || typeof visitorCount !== 'number') {
      throw new Error('Unexpected Redis transaction result');
    }

    return {
      date,
      userId,
      isNewVisitor: addedCount === 1,
      visitorCount,
    };
  }

  /**
   * 날짜별 방문자 Set의 member 개수를 조회합니다.
   *
   * 1. 날짜 기준 Redis Set key를 만듭니다.
   * 2. SCARD로 해당 날짜 Set의 member 개수를 조회합니다.
   *
   * 실습 포인트:
   * Redis Set에는 같은 userId가 한 번만 저장되므로, SCARD 결과를 중복 제거된 로그인 방문자 수로 볼 수 있습니다.
   */
  async getDailyVisitorCount(date: string): Promise<number> {
    const key = RedisKey.set.dailyVisitors(date);

    // 일일 방문자 목록에 기록된 고유 방문자 수를 조회합니다.
    // 중복이 제거된 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    return redis.sCard(key);
  }

  /**
   * 특정 사용자가 해당 날짜에 방문 기록을 남겼는지 확인합니다.
   *
   * 1. 날짜 기준 Redis Set key를 만듭니다.
   * 2. userId를 Redis Set member 문자열로 변환합니다.
   * 3. SISMEMBER로 Set 안에 member가 있는지 확인합니다.
   * 4. Redis의 1 또는 0 응답을 boolean 값으로 변환합니다.
   *
   * 실습 포인트:
   * SISMEMBER는 Set 안에 특정 member가 존재하는지 빠르게 확인할 때 사용합니다.
   */
  async hasVisitedToday(date: string, userId: number): Promise<boolean> {
    const key = RedisKey.set.dailyVisitors(date);
    const member = createVisitorMember(userId);

    // 지정한 방문자이 일일 방문자 목록에 포함되어 있는지 확인합니다.
    // 포함되어 있으면 1을, 포함되어 있지 않거나 목록이 없으면 0을 반환합니다.
    const result = await redis.sIsMember(key, member);

    return result === 1;
  }

  /**
   * 날짜별 방문자 수와 방문 사용자 목록을 함께 조회합니다.
   *
   * 1. 날짜 기준 Redis Set key를 만듭니다.
   * 2. SMEMBERS로 Set의 모든 userId member를 조회합니다.
   * 3. 문자열 userId를 number로 변환합니다.
   * 4. 응답 순서가 안정적이도록 오름차순 정렬합니다.
   * 5. 방문자 수와 사용자 ID 목록을 함께 반환합니다.
   *
   * 실습 포인트:
   * SMEMBERS는 Set 전체를 한 번에 가져오므로 Set의 중복 제거 결과를 눈으로 확인하기 좋습니다.
   *
   * 참고:
   * 방문자가 매우 많은 서비스에서는 운영 API에서 SMEMBERS 대신 SSCAN 같은 점진 조회 방식을 고려해야 합니다.
   */
  async getDailyVisitorSummary(date: string): Promise<DailyVisitorSummaryOutput> {
    const key = RedisKey.set.dailyVisitors(date);

    // 일일 방문자 목록에 기록된 모든 방문자을 조회합니다.
    // 저장 순서와 관계없이 모든 항목을 반환하며, 목록이 없으면 빈 배열을 반환합니다.
    const userIds = (await redis.sMembers(key)).map(Number).sort((a, b) => a - b);

    return {
      date,
      visitorCount: userIds.length,
      userIds,
    };
  }

  /**
   * 날짜별 방문자 Set을 삭제합니다.
   *
   * 1. 날짜 기준 Redis Set key를 만듭니다.
   * 2. Redis에서 해당 key 자체를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key를 삭제하므로 해당 날짜의 방문자 member가 모두 사라집니다.
   *
   * 참고:
   * 테스트 초기화 또는 통계 재계산 시 사용할 수 있습니다.
   */
  async deleteDailyVisitors(date: string): Promise<void> {
    const key = RedisKey.set.dailyVisitors(date);

    // 일일 방문자 목록 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
