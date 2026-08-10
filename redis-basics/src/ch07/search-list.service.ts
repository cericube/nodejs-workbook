// src/ch07/search-list.service.ts

import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/**
 * 최근 검색어 목록 조회 시 반환하는 검색어 데이터입니다.
 *
 * Redis List가 이미 최신순을 유지하므로 별도의 order 값은 내려주지 않습니다.
 */
export type RecentSearchKeywordOutput = {
  keyword: string;
};

/**
 * 검색어 저장 전에 앞뒤 공백을 제거합니다.
 *
 * 1. 사용자가 입력한 원본 검색어를 받습니다.
 * 2. Redis에 저장하기 전에 trim으로 앞뒤 공백을 제거합니다.
 */
function normalizeKeyword(keyword: string): string {
  return keyword.trim();
}

/** Redis List를 이용해 사용자별 최근 검색어를 중복 없이 최신순으로 관리합니다. */
export class SearchListService {
  /**
   * 사용자의 최근 검색어를 Redis List에 기록합니다.
   *
   * 1. 검색어 앞뒤 공백을 제거합니다.
   * 2. 빈 검색어는 저장하지 않습니다.
   * 3. 같은 검색어가 이미 있으면 먼저 제거해서 중복을 방지합니다.
   * 4. 새 검색어를 List 앞쪽에 넣어 최신순을 유지합니다.
   * 5. 지정한 개수만 남기고 오래된 검색어는 잘라냅니다.
   *
   * 실습 포인트:
   * Redis List는 입력 순서를 유지하므로 최근 검색어처럼 순서가 중요한 기록에 적합합니다.
   *
   * 참고:
   * 같은 검색어를 다시 검색하면 기존 위치의 값을 제거한 뒤 맨 앞으로 옮기는 방식으로 최신 기록을 갱신합니다.
   * LREM, LPUSH, LTRIM은 MULTI/EXEC으로 묶어 동시 요청에도 하나의 작업처럼 실행합니다.
   */
  async addRecentSearchKeyword(userId: number, keyword: string, limit = 10): Promise<void> {
    const normalizedKeyword = normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      return;
    }

    const key = RedisKey.list.searchRecent(userId);

    // 중복 제거, 최신 위치 추가, 개수 제한을 하나의 Transaction으로 실행합니다.
    // 다른 요청이 세 명령 사이에 끼어들 수 없으므로 동일 검색어의 중복과 순서 변경을 방지합니다.
    await redis
      .multi()
      .lRem(key, 0, normalizedKeyword)
      .lPush(key, normalizedKeyword)
      .lTrim(key, 0, limit - 1)
      .exec();
  }

  /**
   * Redis List에서 최근 검색어 목록을 최신순으로 조회합니다.
   *
   * 1. 사용자별 최근 검색어 List key를 만듭니다.
   * 2. Redis List의 앞쪽부터 limit개만 읽습니다.
   * 3. 조회한 문자열 목록을 응답 객체 배열로 변환합니다.
   *
   * 실습 포인트:
   * LRANGE는 List의 일부 구간을 조회할 때 사용합니다.
   *
   * 참고:
   * Redis List가 이미 순서를 보장하므로 order 같은 별도 순번 필드는 만들지 않습니다.
   */
  async getRecentSearchKeywords(userId: number, limit = 10): Promise<RecentSearchKeywordOutput[]> {
    const key = RedisKey.list.searchRecent(userId);

    // 사용자의 최근 검색어 목록에서 필요한 범위의 항목을 조회합니다.
    // 지정한 범위의 값을 순서대로 반환하며, 저장된 항목이 없으면 빈 배열을 반환합니다.
    const keywords = await redis.lRange(key, 0, limit - 1);

    return keywords.map((keyword) => ({
      keyword,
    }));
  }

  /**
   * 사용자의 최근 검색어 목록에서 특정 검색어를 삭제합니다.
   *
   * 1. 검색어 앞뒤 공백을 제거합니다.
   * 2. 빈 검색어이면 Redis 명령을 실행하지 않습니다.
   * 3. 사용자별 최근 검색어 List에서 해당 검색어를 제거합니다.
   *
   * 실습 포인트:
   * LREM은 List에 들어 있는 특정 값을 삭제할 때 사용합니다.
   */
  async deleteRecentSearchKeyword(userId: number, keyword: string): Promise<void> {
    const normalizedKeyword = normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      return;
    }

    const key = RedisKey.list.searchRecent(userId);

    // 사용자의 최근 검색어 목록에서 중복되거나 삭제할 항목을 제거합니다.
    // 조건에 맞는 값을 제거하고 제거한 항목 수를 반환하며, 일치하는 값이 없으면 0을 반환합니다.
    await redis.lRem(key, 0, normalizedKeyword);
  }

  /**
   * 사용자의 최근 검색어 Redis List를 삭제합니다.
   *
   * 1. 사용자별 최근 검색어 List key를 만듭니다.
   * 2. Redis에서 해당 key 자체를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key를 삭제하는 명령입니다. 최근 검색어 전체 초기화처럼 List 전체가 필요 없을 때 사용합니다.
   */
  async clearRecentSearchKeywords(userId: number): Promise<void> {
    const key = RedisKey.list.searchRecent(userId);

    // 사용자의 최근 검색어 목록 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
