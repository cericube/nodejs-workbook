import { describe, expect, it } from 'vitest';

import { RateLimitService } from '../../src/ch05/rate-limit.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

describe('RateLimitService', () => {
  const service = new RateLimitService();

  it('고정 윈도우의 제한 횟수를 초과하면 요청을 거부한다', async () => {
    const first = await service.checkLimit('custom', 2, 30);
    const second = await service.checkLimit('custom', 2, 30);
    const third = await service.checkLimit('custom', 2, 30);

    expect(first).toMatchObject({ allowed: true, count: 1, limit: 2 });
    expect(second).toMatchObject({ allowed: true, count: 2, limit: 2 });
    expect(third).toMatchObject({ allowed: false, count: 3, limit: 2 });
    expect(third.ttl).toBeGreaterThan(0);
    expect(third.ttl).toBeLessThanOrEqual(30);
    await expect(service.getCurrentCount('custom')).resolves.toBe(3);
  });

  it('TTL이 없는 기존 카운터를 발견하면 만료 시간을 복구한다', async () => {
    const key = RedisKey.string.rateLimit('orphan');
    await redis.set(key, '1');

    expect(await redis.ttl(key)).toBe(-1);

    const result = await service.checkLimit('orphan', 5, 20);
    expect(result.count).toBe(2);
    expect(result.ttl).toBeGreaterThan(0);
    expect(result.ttl).toBeLessThanOrEqual(20);
  });

  it('제한 상태를 삭제해 요청 횟수를 초기화한다', async () => {
    await service.checkLimit('reset-target', 5, 60);
    await service.resetLimit('reset-target');

    await expect(service.getCurrentCount('reset-target')).resolves.toBe(0);
  });

  it('0 이하이거나 정수가 아닌 제한값을 거부한다', async () => {
    await expect(service.checkLimit('invalid-limit', 0, 60)).rejects.toThrow(
      'limit must be a positive integer',
    );
    await expect(service.checkLimit('invalid-window', 5, -1)).rejects.toThrow(
      'windowSeconds must be a positive integer',
    );
    await expect(service.checkLimit('decimal-window', 5, 0.5)).rejects.toThrow(
      'windowSeconds must be a positive integer',
    );

    // 검증 실패 시 Redis에 제한 Key가 생성되지 않아야 합니다.
    expect(await redis.exists(RedisKey.string.rateLimit('invalid-limit'))).toBe(0);
  });

  it('로그인은 IP 기준 5회, API는 사용자 기준 20회로 제한한다', async () => {
    let loginResult = await service.checkLoginLimitByIp('127.0.0.1');
    for (let count = 1; count < 6; count += 1) {
      loginResult = await service.checkLoginLimitByIp('127.0.0.1');
    }

    expect(loginResult).toMatchObject({ allowed: false, count: 6, limit: 5 });

    const apiResult = await service.checkApiLimitByUser(1);
    expect(apiResult).toMatchObject({ allowed: true, count: 1, limit: 20 });
    expect(apiResult.ttl).toBeLessThanOrEqual(10);
  });
});
