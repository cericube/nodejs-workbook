import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import { assertFiniteScore, isValidLimit } from './zset-validation.js';

/** 인기 검색어 목록에서 검색어, 누적 점수, 순위를 반환할 때 사용하는 응답 데이터입니다. */
export type PopularKeywordOutput = {
  keyword: string;
  score: number;
  rank: number;
};

/** Redis Sorted Set으로 검색어별 누적 점수와 인기 순위를 관리하는 서비스입니다. */
export class SearchZSetService {
  /**
   * 검색어를 집계에 사용할 형식으로 정규화합니다.
   *
   * 1. 검색어 앞뒤의 공백을 제거합니다.
   * 2. 모든 문자를 소문자로 변환합니다.
   *
   * 실습 포인트:
   * "Redis", "redis", " redis "처럼 표현만 다른 검색어가 하나의 member로 집계되도록 합니다.
   */
  private normalizeKeyword(keyword: string): string {
    return keyword.trim().toLowerCase();
  }

  /**
   * 검색된 키워드의 누적 점수를 증가시킵니다.
   *
   * 1. 검색어를 정규화하고 빈 값인지 확인합니다.
   * 2. 정규화한 검색어를 Sorted Set의 member로 사용합니다.
   * 3. ZINCRBY로 score를 지정한 값만큼 증가시킵니다.
   *
   * 실습 포인트:
   * ZINCRBY는 member가 없으면 새로 추가하고, 있으면 기존 score에 값을 더합니다.
   */
  async increaseSearchKeywordScore(keyword: string, score = 1): Promise<number> {
    // 잘못된 score가 Redis에 전달되기 전에 입력 단계에서 거부합니다.
    assertFiniteScore(score, '검색어 랭킹 점수');

    const normalizedKeyword = this.normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      throw new Error('검색어가 비어 있습니다.');
    }

    const key = RedisKey.zset.searchRanking();

    // 인기 검색어 랭킹에서 검색어의 점수를 증가시킵니다.
    // 검색어가 없으면 추가하고, 있으면 점수를 누적한 뒤 최종 점수를 반환합니다.
    return redis.zIncrBy(key, score, normalizedKeyword);
  }

  /**
   * 누적 점수가 높은 인기 검색어를 지정한 개수만큼 조회합니다.
   *
   * 1. ZRANGE의 REV 옵션으로 score가 높은 member부터 조회합니다.
   * 2. 조회한 검색어와 score를 응답 데이터로 변환합니다.
   * 3. 배열 index에 1을 더해 사용자에게 표시할 순위를 계산합니다.
   *
   * 실습 포인트:
   * Sorted Set은 score 기준 정렬과 범위 조회를 지원하므로 TOP N 랭킹을 바로 조회할 수 있습니다.
   */
  async getPopularKeywords(limit = 10): Promise<PopularKeywordOutput[]> {
    // limit 0을 ZRANGE의 전체 범위인 0, -1로 잘못 변환하지 않도록 검사합니다.
    if (!isValidLimit(limit)) {
      return [];
    }

    const key = RedisKey.zset.searchRanking();

    // 인기 검색어 랭킹에서 상위 검색어를 점수와 함께 조회합니다.
    // REV 옵션으로 점수가 높은 순서의 지정 범위를 반환하며, 검색어가 없으면 빈 배열을 반환합니다.
    const items = await redis.zRangeWithScores(key, 0, limit - 1, {
      REV: true,
    });

    return items.map((item, index) => ({
      keyword: item.value,
      score: item.score,
      rank: index + 1,
    }));
  }

  /**
   * 특정 검색어의 현재 누적 점수를 조회합니다.
   *
   * 1. 검색어를 정규화하고 빈 값이면 0을 반환합니다.
   * 2. ZSCORE로 해당 member의 score를 조회합니다.
   * 3. 저장되지 않은 검색어라면 0을 반환합니다.
   *
   * 참고:
   * Redis의 ZSCORE는 member가 존재하지 않으면 null을 반환합니다.
   */
  async getKeywordScore(keyword: string): Promise<number> {
    const normalizedKeyword = this.normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      return 0;
    }

    const key = RedisKey.zset.searchRanking();
    // 인기 검색어 랭킹에서 검색어의 현재 점수를 조회합니다.
    // 검색어가 랭킹에 없으면 null을 반환합니다.
    const score = await redis.zScore(key, normalizedKeyword);

    return score ?? 0;
  }

  /**
   * 특정 검색어의 현재 순위를 조회합니다.
   *
   * 1. 검색어를 정규화하고 빈 값이면 null을 반환합니다.
   * 2. ZREVRANK로 score가 높은 순서의 위치를 조회합니다.
   * 3. Redis의 0 기반 순위에 1을 더해 사용자용 순위로 변환합니다.
   *
   * 참고:
   * Sorted Set에 검색어가 없으면 순위를 계산할 수 없으므로 null을 반환합니다.
   */
  async getKeywordRank(keyword: string): Promise<number | null> {
    const normalizedKeyword = this.normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      return null;
    }

    const key = RedisKey.zset.searchRanking();
    // 인기 검색어 랭킹에서 점수가 높은 순서의 현재 위치를 조회합니다.
    // 0부터 시작하는 순위를 반환하며, 검색어가 랭킹에 없으면 null을 반환합니다.
    const zeroBasedRank = await redis.zRevRank(key, normalizedKeyword);

    if (zeroBasedRank === null) {
      return null;
    }

    return zeroBasedRank + 1;
  }

  /**
   * 특정 검색어를 인기 검색어 랭킹에서 제거합니다.
   *
   * 1. 검색어를 정규화하고 빈 값이면 작업을 종료합니다.
   * 2. ZREM으로 해당 member와 score를 함께 제거합니다.
   *
   * 참고:
   * 검색어가 Sorted Set에 없어도 ZREM은 오류를 발생시키지 않습니다.
   */
  async removeKeyword(keyword: string): Promise<void> {
    const normalizedKeyword = this.normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      return;
    }

    const key = RedisKey.zset.searchRanking();

    // 인기 검색어 랭킹에서 지정한 검색어를 제거합니다.
    // 검색어와 점수를 함께 제거하고 제거한 수를 반환하며, 검색어가 없으면 0을 반환합니다.
    await redis.zRem(key, normalizedKeyword);
  }

  /**
   * 인기 검색어 랭킹 전체를 초기화합니다.
   *
   * 1. 검색어 랭킹에 사용하는 Redis key를 가져옵니다.
   * 2. DEL로 key를 삭제해 모든 member와 score를 제거합니다.
   *
   * 참고:
   * 테스트 데이터를 정리하거나 랭킹 집계 주기를 새로 시작할 때 사용할 수 있습니다.
   */
  async clearSearchRanking(): Promise<void> {
    const key = RedisKey.zset.searchRanking();

    // 인기 검색어 랭킹 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
