// tests/ch07/search-list.service.test.ts

import { describe, expect, it } from 'vitest';

import { SearchListService } from '../../src/ch07/search-list.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

/** 사용자별 최근 검색어의 정규화, 순서, 중복 제거, 개수 제한을 검증합니다. */
describe('SearchListService', () => {
  const service = new SearchListService();
  const userId = 1;

  it('검색어의 앞뒤 공백을 제거하고 빈 검색어는 저장하지 않는다', async () => {
    await service.addRecentSearchKeyword(userId, '  Redis  ');
    await service.addRecentSearchKeyword(userId, '   ');

    await expect(service.getRecentSearchKeywords(userId)).resolves.toEqual([{ keyword: 'Redis' }]);
  });

  it('최근 검색어를 최신순으로 유지하고 중복 검색어를 맨 앞으로 옮긴다', async () => {
    await service.addRecentSearchKeyword(userId, 'Redis');
    await service.addRecentSearchKeyword(userId, 'Node.js');
    await service.addRecentSearchKeyword(userId, 'Redis');

    await expect(service.getRecentSearchKeywords(userId)).resolves.toEqual([
      { keyword: 'Redis' },
      { keyword: 'Node.js' },
    ]);
  });

  it('지정한 개수만 남기고 오래된 검색어를 제거한다', async () => {
    await service.addRecentSearchKeyword(userId, '첫 번째', 2);
    await service.addRecentSearchKeyword(userId, '두 번째', 2);
    await service.addRecentSearchKeyword(userId, '세 번째', 2);

    await expect(service.getRecentSearchKeywords(userId)).resolves.toEqual([
      { keyword: '세 번째' },
      { keyword: '두 번째' },
    ]);
  });

  it('동시에 같은 검색어를 추가해도 중복 값을 남기지 않는다', async () => {
    // MULTI/EXEC이 LREM, LPUSH, LTRIM 사이의 다른 요청 개입을 막는지 확인합니다.
    await Promise.all(
      Array.from({ length: 5 }, () => service.addRecentSearchKeyword(userId, '동시 검색')),
    );

    const key = RedisKey.list.searchRecent(userId);
    await expect(redis.lRange(key, 0, -1)).resolves.toEqual(['동시 검색']);
  });

  it('특정 검색어와 전체 최근 검색어를 삭제한다', async () => {
    await service.addRecentSearchKeyword(userId, 'Redis');
    await service.addRecentSearchKeyword(userId, 'Node.js');

    await service.deleteRecentSearchKeyword(userId, ' Redis ');
    await expect(service.getRecentSearchKeywords(userId)).resolves.toEqual([
      { keyword: 'Node.js' },
    ]);

    await service.clearRecentSearchKeywords(userId);
    await expect(service.getRecentSearchKeywords(userId)).resolves.toEqual([]);
  });
});
