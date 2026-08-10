// tests/ch11/cache-invalidation-pubsub.service.test.ts

import { describe, expect, it, vi } from 'vitest';

import { CacheInvalidationPubSubService } from '../../src/ch11/cache-invalidation-pubsub.service.js';
import { redis } from '../../src/shared/redis.js';
import { RedisKey } from '../../src/shared/redis-key.js';

/** 캐시 무효화 메시지의 발행, 실제 키 삭제와 네임스페이스 보호를 검증합니다. */
describe('CacheInvalidationPubSubService', () => {
  const service = new CacheInvalidationPubSubService();

  it('수신한 사용자 캐시 무효화 메시지의 키를 삭제한다', async () => {
    // 구독자가 삭제할 캐시를 미리 만들어 Pub/Sub 수신의 부수 효과를 확인합니다.
    const key = RedisKey.cache.user(1);
    await redis.set(key, 'cached-user');

    let resolveInvalidated!: () => void;
    const invalidated = new Promise<void>((resolve) => {
      resolveInvalidated = resolve;
    });
    // 삭제와 콜백 호출이 끝난 뒤에만 Redis 값을 조회하도록 Promise로 동기화합니다.
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
    // 발행 단계에서 임의 키를 차단해 정상 구독자도 cache:* 밖의 키를 삭제하지 못하게 합니다.
    await expect(
      service.publishCustomKeyInvalidation('string:auth-code:user@example.com', 'malicious'),
    ).rejects.toThrow('must use the cache: namespace');
  });

  it('위조 메시지로 일반 Redis 키를 삭제하지 않는다', async () => {
    // publish API를 우회한 공격도 대비해야 하므로 채널에 위조 payload를 직접 발행합니다.
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
      // 오류 로그는 subscriber가 메시지를 파싱하고 거부했다는 완료 신호로 사용합니다.
      await logged;

      expect(await redis.get(protectedKey)).toBe('keep-me');
      expect(onInvalidated).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      await stop();
    }
  });
});
