import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/**
 * 중복 요청 검사와 기록 후 반환하는 결과 데이터입니다.
 *
 * firstRequest는 현재 requestId가 새로 저장되었는지, duplicate는 이미 저장된 요청인지 나타냅니다.
 */
export type DuplicateRequestResult = {
  requestGroup: string;
  requestId: string;
  firstRequest: boolean;
  duplicate: boolean;
  storedRequestCount: number;
  ttl: number;
};

export class RequestSetService {
  /**
   * 요청 ID를 Redis Set에 저장하고 중복 여부를 판단합니다.
   *
   * 1. 업무 단위별 중복 요청 Redis Set key를 만듭니다.
   * 2. requestId를 Set member로 추가합니다.
   * 3. Set에 TTL을 설정해 일정 시간이 지나면 중복 기록을 자동 삭제합니다.
   * 4. 저장된 requestId 개수와 남은 TTL을 조회합니다.
   * 5. SADD 결과를 기준으로 최초 요청 여부와 중복 여부를 반환합니다.
   *
   * 실습 포인트:
   * Redis Set은 같은 requestId를 한 번만 저장하므로 짧은 시간 안의 중복 요청 방지에 사용할 수 있습니다.
   *
   * 참고:
   * requestGroup은 order:create, coupon:use처럼 중복을 검사할 업무 단위입니다.
   * 이 메서드는 요청이 들어올 때마다 EXPIRE를 다시 설정하므로 TTL이 최근 요청 기준으로 연장됩니다.
   */
  async checkAndStoreRequest(
    requestGroup: string,
    requestId: string,
    ttlSeconds = 300,
  ): Promise<DuplicateRequestResult> {
    const key = RedisKey.set.duplicateRequest(requestGroup);

    // 중복 요청 기록에 새 요청 ID을 중복 없이 기록합니다.
    // 새로 추가한 항목 수를 반환하며, 이미 기록된 요청 ID이면 0을 반환합니다.
    const addedCount = await redis.sAdd(key, requestId);

    // 중복 요청 기록이 일정 시간이 지나면 자동으로 정리되도록 설정합니다.
    // 만료 시간을 설정하면 1을, 요청 ID 데이터가 없으면 0을 반환합니다.
    await redis.expire(key, ttlSeconds);

    // 중복 요청 기록에 기록된 고유 요청 ID 수를 조회합니다.
    // 중복이 제거된 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    const storedRequestCount = await redis.sCard(key);

    // 중복 요청 기록의 남은 유효 시간을 조회합니다.
    // TTL을 초 단위로 반환하며, 만료 설정이 없으면 -1을, 데이터가 없으면 -2를 반환합니다.
    const ttl = await redis.ttl(key);

    return {
      requestGroup,
      requestId,
      firstRequest: addedCount === 1,
      duplicate: addedCount === 0,
      storedRequestCount,
      ttl,
    };
  }

  /**
   * 요청 ID가 이미 해당 업무 Set에 기록되어 있는지 확인합니다.
   *
   * 1. 업무 단위별 중복 요청 Redis Set key를 만듭니다.
   * 2. SISMEMBER로 requestId 존재 여부를 확인합니다.
   * 3. Redis의 1 또는 0 응답을 boolean 값으로 변환합니다.
   *
   * 실습 포인트:
   * 요청을 실제로 처리하기 전에 이 메서드로 중복 여부만 먼저 조회할 수 있습니다.
   */
  async isDuplicateRequest(requestGroup: string, requestId: string): Promise<boolean> {
    const key = RedisKey.set.duplicateRequest(requestGroup);

    // 지정한 요청 ID이 중복 요청 기록에 포함되어 있는지 확인합니다.
    // 포함되어 있으면 1을, 포함되어 있지 않거나 목록이 없으면 0을 반환합니다.
    const result = await redis.sIsMember(key, requestId);
    return result === 1;
  }

  /**
   * 주문 생성 요청의 중복 여부를 5분 기준으로 확인하고 기록합니다.
   *
   * 실습 포인트:
   * 같은 requestId로 5분 안에 다시 주문 생성 요청이 들어오면 중복으로 판단합니다.
   */
  async checkOrderCreateRequest(requestId: string): Promise<DuplicateRequestResult> {
    return this.checkAndStoreRequest('order:create', requestId, 300);
  }

  /**
   * 쿠폰 사용 요청의 중복 여부를 5분 기준으로 확인하고 기록합니다.
   *
   * 실습 포인트:
   * 같은 requestId로 5분 안에 다시 쿠폰 사용 요청이 들어오면 중복으로 판단합니다.
   */
  async checkCouponUseRequest(requestId: string): Promise<DuplicateRequestResult> {
    return this.checkAndStoreRequest('coupon:use', requestId, 300);
  }

  /**
   * 이메일 발송 요청의 중복 여부를 3분 기준으로 확인하고 기록합니다.
   *
   * 실습 포인트:
   * 같은 requestId로 3분 안에 다시 이메일 발송 요청이 들어오면 중복으로 판단합니다.
   */
  async checkEmailSendRequest(requestId: string): Promise<DuplicateRequestResult> {
    return this.checkAndStoreRequest('email:send', requestId, 180);
  }

  /**
   * 요청 그룹에 저장된 requestId 개수를 조회합니다.
   *
   * 1. 업무 단위별 중복 요청 Redis Set key를 만듭니다.
   * 2. SCARD로 Set에 저장된 requestId 개수를 반환합니다.
   *
   * 실습 포인트:
   * Set의 member 개수로 TTL 안에 기록된 고유 요청 수를 확인할 수 있습니다.
   */
  async getStoredRequestCount(requestGroup: string): Promise<number> {
    const key = RedisKey.set.duplicateRequest(requestGroup);

    // 중복 요청 기록에 기록된 고유 요청 ID 수를 조회합니다.
    // 중복이 제거된 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    return redis.sCard(key);
  }

  /**
   * 요청 그룹의 중복 요청 기록을 삭제합니다.
   *
   * 1. 업무 단위별 중복 요청 Redis Set key를 만듭니다.
   * 2. Redis에서 해당 key 자체를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key를 삭제하므로 해당 요청 그룹의 중복 검사 기록이 모두 사라집니다.
   */
  async clearDuplicateRequests(requestGroup: string): Promise<void> {
    const key = RedisKey.set.duplicateRequest(requestGroup);

    // 중복 요청 기록 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
