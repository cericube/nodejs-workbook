import { describe, expect, it, vi } from 'vitest';
import { CacheInvalidationPubSubService } from '../../src/ch11/cache-invalidation-pubsub.service.js';
import { redis } from '../../src/shared/redis.js';
import { RedisKey } from '../../src/shared/redis-key.js';

describe('CacheInvalidationPubSubService', () => {
  const service = new CacheInvalidationPubSubService();

  it('수신한 사용자 캐시 무효화 메시지의 키를 삭제한다', async () => {
    const key = RedisKey.cache.user(1);
    await redis.set(key, 'cached-user');

    let resolveInvalidated!: () => void;
    const invalidated = new Promise<void>((resolve) => {
      resolveInvalidated = resolve;
    });
    const stop = await service.subscribeCacheInvalidation(() => resolveInvalidated());

    try {
      await expect(service.publishUserCacheInvalidation(1)).resolves.toBe(1);
      await invalidated;

      expect(await redis.get(key)).toBeNull();
    } finally {
      await stop();
    }
  });

  it('cache 네임스페이스 밖의 사용자 정의 키는 발행하지 않는다', async () => {
    await expect(
      service.publishCustomKeyInvalidation('string:auth-code:user@example.com', 'malicious'),
    ).rejects.toThrow('must use the cache: namespace');
  });

  it('위조 메시지로 일반 Redis 키를 삭제하지 않는다', async () => {
    const protectedKey = 'string:protected';
    await redis.set(protectedKey, 'keep-me');

    let resolveLogged!: () => void;
    const logged = new Promise<void>((resolve) => {
      resolveLogged = resolve;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => resolveLogged());
    const onInvalidated = vi.fn();
    const stop = await service.subscribeCacheInvalidation(onInvalidated);

    try {
      await redis.publish(
        RedisKey.channel.cacheInvalidation(),
        JSON.stringify({
          type: 'CUSTOM_KEY_INVALIDATED',
          key: protectedKey,
          reason: 'forged event',
          createdAt: new Date().toISOString(),
        }),
      );
      await logged;

      expect(await redis.get(protectedKey)).toBe('keep-me');
      expect(onInvalidated).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      await stop();
    }
  });
});
