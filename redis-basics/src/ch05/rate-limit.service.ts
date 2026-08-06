// src/ch05/rate-limit.service.ts

import { redis } from '../shared/redis';
import { RedisKey } from '../shared/redis-key';

export type RateLimitResult = {
  /** 현재 요청을 허용할 수 있는지 나타냅니다. */
  allowed: boolean;
  /** 현재 윈도우에서 집계된 요청 횟수입니다. */
  count: number;
  /** 현재 윈도우에서 허용하는 최대 요청 횟수입니다. */
  limit: number;
  /** 제한 카운터가 초기화될 때까지 남은 시간(초)입니다. */
  ttl: number;
};

/**
 * Redis 카운터와 TTL을 조합한 고정 윈도우 요청 제한 서비스입니다.
 *
 * 인스턴스는 상태를 갖지 않으며, 모든 제한 상태는 Redis Key에 저장됩니다.
 */
export class RateLimitService {
  /**
   * 고정 윈도우 방식 Rate Limiting
   *
   * 1. 요청을 구분할 key를 Redis rate limit key로 변환합니다.
   * 2. Redis INCR 명령으로 요청 횟수를 1 증가시킵니다.
   * 3. 현재 Redis key의 TTL을 조회합니다.
   * 4. 첫 요청이거나 TTL이 없는 key라면 windowSeconds 만큼 TTL을 설정합니다.
   * 5. count가 limit 이하이면 요청을 허용합니다.
   *
   * 예:
   * windowSeconds가 60이고 limit이 5라면,
   * 같은 key로 60초 동안 최대 5번까지만 요청을 허용합니다.
   *
   * 실습 포인트:
   * Redis String 값을 카운터로 사용하고,
   * TTL을 함께 걸어 일정 시간이 지나면 요청 횟수가 자동 초기화되게 합니다.
   *
   * 보완 포인트:
   * INCR 성공 후 EXPIRE 실행 전에 장애가 나면 TTL 없는 key가 남을 수 있습니다.
   * 그래서 ttl === -1인 경우에도 expire를 다시 설정해 제한 key를 복구합니다.
   *
   * @param key 요청 대상을 구분하는 식별자입니다.
   * @param limit 한 윈도우에서 허용할 최대 요청 횟수입니다.
   * @param windowSeconds 요청 횟수를 집계할 시간입니다.
   * @returns 허용 여부, 현재 요청 수, 제한 수 및 남은 TTL입니다.
   */
  async checkLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    // 잘못된 제한값은 모든 요청을 차단하거나 Key를 즉시 만료시키므로
    // Redis 명령을 실행하기 전에 양의 정수인지 검증합니다.
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('limit must be a positive integer');
    }

    if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
      throw new Error('windowSeconds must be a positive integer');
    }

    // 요청 제한용 Redis key입니다.
    // 예: string:rate-limit:login:ip:127.0.0.1
    const redisKey = RedisKey.string.rateLimit(key);

    // INCR 후 EXPIRE가 별도 명령이라,
    // 아주 드물게 INCR 성공 후 EXPIRE 전에 장애가 나면
    // TTL 없는 제한 키가 남을 수 있습니다.
    // 실서비스라면 Lua script나 Redis transaction으로 묶는 방식을 고려할 수 있습니다.

    // 요청 제한 카운터를 1 증가시킵니다.
    // 기존 값에 1을 더한 결과를 반환하며, 저장된 값이 없으면 0에서 시작합니다.
    const count = await redis.incr(redisKey);

    // 요청 제한 카운터의 남은 유효 시간을 조회합니다.
    // TTL을 초 단위로 반환하며, 만료 설정이 없으면 -1을, 데이터가 없으면 -2를 반환합니다.
    let ttl = await redis.ttl(redisKey);

    if (count === 1 || ttl === -1) {
      // 요청 제한 카운터이 일정 시간이 지나면 자동으로 정리되도록 설정합니다.
      // 만료 시간을 설정하면 1을, 요청 제한 데이터가 없으면 0을 반환합니다.
      await redis.expire(redisKey, windowSeconds);

      // 요청 제한 카운터의 남은 유효 시간을 조회합니다.
      // TTL을 초 단위로 반환하며, 만료 설정이 없으면 -1을, 데이터가 없으면 -2를 반환합니다.
      ttl = await redis.ttl(redisKey);
    }

    return {
      // count가 limit을 초과하면 더 이상 요청을 허용하지 않습니다.
      allowed: count <= limit,
      count,
      limit,
      ttl,
    };
  }

  // async checkLimitWithLuaScript(
  //   key: string,
  //   limit: number,
  //   windowSeconds: number,
  // ): Promise<RateLimitResult> {
  // Lua script를 사용한 rate limit 체크 로직을 구현할 수 있습니다.
  // Lua script는 Redis 서버에서 실행되므로, INCR와 EXPIRE를 원자적으로 처리할 수 있습니다.
  // 예시 Lua script:
  /*
    const redisKey = RedisKey.string.rateLimit(key);
    const script = `
    local count = redis.call('INCR', KEYS[1])
    local ttl = redis.call('TTL', KEYS[1])

    if count == 1 or ttl == -1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
      ttl = redis.call('TTL', KEYS[1])
    end

    return { count, ttl }
  `;
    const result = await redis.eval(script, {
      keys: [redisKey],
      arguments: [String(windowSeconds)],
    });

    const [count, ttl] = result as [number, number];
    return {
      allowed: count <= limit,
      count,
      limit,
      ttl,
    };
     */
  // 실제 구현에서는 Lua script를 Redis에 등록하고 EVALSHA 명령으로 실행하는 방식이 일반적입니다.
  // 이 방법은 INCR와 EXPIRE가 원자적으로 처리되어 TTL 없는 key가 남는 문제를 방지할 수 있습니다.

  //   throw new Error('checkLimitWithLuaScript is not implemented yet');
  // }

  /**
   * 로그인 요청 제한
   *
   * 1. IP 주소를 기준으로 로그인 요청 제한 key를 만듭니다.
   * 2. 같은 IP에서 60초 동안 최대 5회 요청만 허용합니다.
   *
   * 실습 포인트:
   * 로그인처럼 공격 대상이 되기 쉬운 API는 IP 기준 제한을 둘 수 있습니다.
   */
  async checkLoginLimitByIp(ip: string): Promise<RateLimitResult> {
    return this.checkLimit(`login:ip:${ip}`, 5, 60);
  }

  /**
   * 사용자별 API 요청 제한
   *
   * 1. userId를 기준으로 API 요청 제한 key를 만듭니다.
   * 2. 같은 사용자에게 10초 동안 최대 20회 요청만 허용합니다.
   *
   * 실습 포인트:
   * 로그인 이후에는 IP보다 사용자 ID 기준으로 요청량을 제한할 수 있습니다.
   */
  async checkApiLimitByUser(userId: number): Promise<RateLimitResult> {
    return this.checkLimit(`api:user:${userId}`, 20, 10);
  }

  /**
   * 현재 요청 횟수 조회
   *
   * 1. 요청 제한용 Redis key를 만듭니다.
   * 2. Redis String 값을 조회합니다.
   * 3. 값이 없으면 아직 요청이 없거나 제한 시간이 끝난 상태로 보고 0을 반환합니다.
   */
  async getCurrentCount(key: string): Promise<number> {
    const redisKey = RedisKey.string.rateLimit(key);
    // 저장된 요청 제한 카운터 값을 조회합니다.
    // 저장된 값이 없으면 null을 반환합니다.
    const value = await redis.get(redisKey);

    // Redis get 결과는 문자열 또는 null입니다.
    // 요청 횟수 계산에 사용하기 위해 number로 변환합니다.
    return value ? Number(value) : 0;
  }

  /**
   * 제한 상태 초기화
   *
   * 1. 요청 제한용 Redis key를 만듭니다.
   * 2. Redis key를 삭제해 요청 횟수와 TTL을 함께 제거합니다.
   *
   * 테스트 코드 또는 관리자 조치에서 사용할 수 있습니다.
   */
  async resetLimit(key: string): Promise<void> {
    const redisKey = RedisKey.string.rateLimit(key);
    // 요청 제한 카운터 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(redisKey);
  }
}
