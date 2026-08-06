import { describe, expect, it } from 'vitest';

import { AuthService } from '../../src/ch05/auth.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

describe('AuthService', () => {
  const service = new AuthService();
  const email = 'auth-test@example.com';

  it('6자리 숫자 인증 코드를 생성한다', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(service.generateAuthCode()).toMatch(/^\d{6}$/);
    }
  });

  it('인증 코드를 Redis에 180초 TTL과 함께 저장한다', async () => {
    const code = await service.saveEmailAuthCode(email);
    const key = RedisKey.string.authCode(email);

    expect(await redis.get(key)).toBe(code);

    const ttl = await service.getAuthCodeTtl(email);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(180);
  });

  it('잘못된 코드는 거부하고 올바른 코드는 한 번만 사용할 수 있다', async () => {
    const code = await service.saveEmailAuthCode(email);

    await expect(service.verifyEmailAuthCode(email, '000000')).resolves.toBe(false);
    await expect(service.verifyEmailAuthCode(email, code)).resolves.toBe(true);
    await expect(service.verifyEmailAuthCode(email, code)).resolves.toBe(false);
    await expect(service.getAuthCodeTtl(email)).resolves.toBe(-2);
  });

  it('같은 코드의 동시 검증 요청은 하나만 성공한다', async () => {
    const code = await service.saveEmailAuthCode(email);

    const results = await Promise.all([
      service.verifyEmailAuthCode(email, code),
      service.verifyEmailAuthCode(email, code),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await redis.get(RedisKey.string.authCode(email))).toBeNull();
  });
});
