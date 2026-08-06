import { redis } from '../shared/redis.js';

/**
 * Redis String 기반 JSON 캐시를 다루는 공통 Service입니다.
 *
 * Redis의 String 자료 구조는 문자열만 저장할 수 있으므로,
 * 객체 데이터는 JSON.stringify()로 문자열로 변환한 뒤 저장하고
 * 조회할 때는 JSON.parse()로 다시 객체로 변환합니다.
 *
 * 사용자 조회 결과, 게시글 상세 조회 결과, 상품 상세 정보 등을
 * 캐싱할 때 사용할 수 있습니다.
 */
export class CacheService {
  /**
   * Redis에서 JSON 문자열을 조회한 뒤 객체로 변환합니다.
   *
   * @param key 조회할 Redis Key입니다.
   * @returns 캐시가 있으면 객체를 반환하고, 없으면 null을 반환합니다.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    try {
      return JSON.parse(cached) as T;
    } catch {
      // JSON 형식이 잘못된 캐시는 삭제하고 캐시가 없는 것으로 처리합니다.
      await this.deleteCache(key);
      return null;
    }
  }

  /**
   * 객체 데이터를 JSON 문자열로 변환하여 Redis에 저장합니다.
   * TTL을 함께 설정하여 캐시가 일정 시간이 지나면 자동으로 만료되게 합니다.
   *
   * @param key 저장할 Redis Key입니다.
   * @param value 저장할 객체 데이터입니다.
   * @param ttlSeconds 캐시 만료 시간이며 초 단위입니다.
   */
  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('ttlSeconds must be a positive integer');
    }

    const serializedValue = JSON.stringify(value);

    // EX 옵션은 만료 시간을 초 단위로 설정합니다.
    await redis.set(key, serializedValue, {
      EX: ttlSeconds,
    });
  }

  /**
   * Redis Key를 삭제합니다.
   * 데이터베이스의 값이 수정되거나 삭제되었을 때 기존 캐시를 무효화하는 데 사용합니다.
   *
   * @param key 삭제할 Redis Key입니다.
   */
  async deleteCache(key: string): Promise<void> {
    await redis.del(key);
  }

  /**
   * Redis Key가 존재하는지 확인합니다.
   *
   * @param key 확인할 Redis Key입니다.
   * @returns Key가 존재하면 true를 반환하고, 없으면 false를 반환합니다.
   */
  async exists(key: string): Promise<boolean> {
    const result = await redis.exists(key);
    return result === 1;
  }
}
