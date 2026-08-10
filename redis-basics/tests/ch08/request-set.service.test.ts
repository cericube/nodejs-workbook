// tests/ch08/request-set.service.test.ts

import { describe, expect, it } from 'vitest';

import { RequestSetService } from '../../src/ch08/request-set.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

/** 요청 그룹별 requestId 중복 판정, TTL, 초기화 동작을 검증합니다. */
describe('RequestSetService', () => {
  const service = new RequestSetService();

  it('처음 받은 requestId와 중복 requestId를 구분한다', async () => {
    const first = await service.checkAndStoreRequest('order:create', 'request-1', 300);
    const duplicate = await service.checkAndStoreRequest('order:create', 'request-1', 300);

    expect(first).toMatchObject({
      firstRequest: true,
      duplicate: false,
      storedRequestCount: 1,
    });
    expect(duplicate).toMatchObject({
      firstRequest: false,
      duplicate: true,
      storedRequestCount: 1,
    });
    await expect(service.isDuplicateRequest('order:create', 'request-1')).resolves.toBe(true);
  });

  it('요청 그룹 Set에 전달한 TTL을 설정한다', async () => {
    const result = await service.checkAndStoreRequest('custom:group', 'request-1', 120);

    expect(result.ttl).toBeGreaterThan(0);
    expect(result.ttl).toBeLessThanOrEqual(120);
    await expect(redis.ttl(RedisKey.set.duplicateRequest('custom:group'))).resolves.toBeGreaterThan(
      0,
    );
  });

  it('업무별 보조 메서드는 서로 다른 요청 그룹을 사용한다', async () => {
    await service.checkOrderCreateRequest('same-id');
    await service.checkCouponUseRequest('same-id');
    await service.checkEmailSendRequest('same-id');

    await expect(service.getStoredRequestCount('order:create')).resolves.toBe(1);
    await expect(service.getStoredRequestCount('coupon:use')).resolves.toBe(1);
    await expect(service.getStoredRequestCount('email:send')).resolves.toBe(1);
  });

  it('동시에 같은 requestId가 들어와도 하나만 최초 요청으로 판단한다', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.checkAndStoreRequest('order:create', 'concurrent-request'),
      ),
    );

    expect(results.filter((result) => result.firstRequest)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(4);
    await expect(service.getStoredRequestCount('order:create')).resolves.toBe(1);
  });

  it('요청 그룹의 중복 기록 전체를 삭제한다', async () => {
    await service.checkAndStoreRequest('order:create', 'request-1');

    await service.clearDuplicateRequests('order:create');

    await expect(service.getStoredRequestCount('order:create')).resolves.toBe(0);
    await expect(service.isDuplicateRequest('order:create', 'request-1')).resolves.toBe(false);
  });
});
