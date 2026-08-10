// tests/ch09/search-zset.service.test.ts

import { describe, expect, it } from 'vitest';

import { SearchZSetService } from '../../src/ch09/search-zset.service.js';

/** 검색어 정규화, 점수 집계, 순위와 입력 경계값을 검증합니다. */
describe('SearchZSetService', () => {
  const service = new SearchZSetService();

  it('대소문자와 앞뒤 공백이 다른 검색어를 하나로 집계한다', async () => {
    // trim과 소문자 변환 뒤 같은 member가 되어 두 점수가 합산되어야 합니다.
    await service.increaseSearchKeywordScore(' Redis ', 2);
    await service.increaseSearchKeywordScore('REDIS', 3);

    await expect(service.getKeywordScore('redis')).resolves.toBe(5);
    await expect(service.getPopularKeywords()).resolves.toEqual([
      { keyword: 'redis', score: 5, rank: 1 },
    ]);
  });

  it('점수가 높은 검색어부터 순위와 함께 반환한다', async () => {
    await service.increaseSearchKeywordScore('node', 3);
    await service.increaseSearchKeywordScore('redis', 10);

    // ZREVRANK의 0 기반 결과가 서비스에서 1 기반 순위로 변환되는지 확인합니다.
    await expect(service.getKeywordRank('redis')).resolves.toBe(1);
    await expect(service.getKeywordRank('node')).resolves.toBe(2);
  });

  it.each([0, -1, 1.5])('유효하지 않은 limit %s에는 빈 배열을 반환한다', async (limit) => {
    await service.increaseSearchKeywordScore('redis');

    // 잘못된 범위가 Redis의 음수 인덱스로 전달되지 않아야 합니다.
    await expect(service.getPopularKeywords(limit)).resolves.toEqual([]);
  });

  it('빈 검색어와 유한하지 않은 점수를 거부한다', async () => {
    // member와 score를 각각 검증해 잘못된 집계 데이터가 생성되는 것을 막습니다.
    await expect(service.increaseSearchKeywordScore('   ')).rejects.toThrow('검색어가 비어');
    await expect(service.increaseSearchKeywordScore('redis', Number.NaN)).rejects.toThrow(
      '유한한 숫자',
    );
  });

  it('검색어를 제거하고 전체 랭킹을 초기화한다', async () => {
    await service.increaseSearchKeywordScore('redis', 2);
    await service.increaseSearchKeywordScore('node', 1);

    await service.removeKeyword('redis');
    await expect(service.getKeywordRank('redis')).resolves.toBeNull();

    await service.clearSearchRanking();
    await expect(service.getPopularKeywords()).resolves.toEqual([]);
  });
});
