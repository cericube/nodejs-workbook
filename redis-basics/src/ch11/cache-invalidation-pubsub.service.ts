import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import {
  parseJsonObject,
  requireEnum,
  requireIsoDate,
  requireRecord,
  requireString,
} from './pubsub-message.js';

const CACHE_INVALIDATION_TYPES = [
  'USER_CACHE_INVALIDATED',
  'POST_CACHE_INVALIDATED',
  'CUSTOM_KEY_INVALIDATED',
] as const;

/** 수신 값을 검증하고 삭제가 허용된 캐시 무효화 메시지로 변환합니다. */
function parseCacheInvalidation(value: unknown): CacheInvalidationMessage {
  const message = requireRecord(value, 'CacheInvalidationMessage');
  const key = requireString(message, 'key', 'CacheInvalidationMessage');

  // 외부에서 위조한 Pub/Sub 메시지가 세션이나 일반 데이터 키를 삭제하지 못하게 합니다.
  if (!key.startsWith('cache:')) {
    throw new TypeError('CacheInvalidationMessage.key must use the cache: namespace');
  }

  return {
    type: requireEnum(message, 'type', CACHE_INVALIDATION_TYPES, 'CacheInvalidationMessage'),
    key,
    reason: requireString(message, 'reason', 'CacheInvalidationMessage'),
    createdAt: requireIsoDate(message, 'createdAt', 'CacheInvalidationMessage'),
  };
}

/**
 * 여러 서버에 전달하는 캐시 무효화 메시지입니다.
 *
 * 무효화 대상과 사유, 이벤트 생성 시각을 담습니다.
 * 각 구독 서버는 메시지의 `key`를 사용해 Redis 캐시를 삭제합니다.
 * 안전을 위해 삭제 대상은 `cache:` 네임스페이스로 제한합니다.
 */
export type CacheInvalidationMessage = {
  type: 'USER_CACHE_INVALIDATED' | 'POST_CACHE_INVALIDATED' | 'CUSTOM_KEY_INVALIDATED';
  key: string;
  reason: string;
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 여러 서버의 캐시 무효화를 전파합니다.
 *
 * 실습 포인트:
 * 1. 한 서버가 캐시 무효화 메시지를 공용 채널에 발행합니다.
 * 2. 채널을 구독 중인 각 서버가 같은 메시지를 수신합니다.
 * 3. 각 서버가 메시지에 포함된 키의 캐시를 삭제합니다.
 *
 * Pub/Sub은 메시지를 저장하거나 재전송하지 않습니다. 따라서 무효화 이벤트를 절대 놓치면
 * 안 되는 환경에서는 짧은 캐시 TTL, 버전 키 또는 Redis Streams 같은 보완 수단이 필요합니다.
 */
export class CacheInvalidationPubSubService {
  /**
   * 캐시 무효화 메시지를 공용 채널에 발행합니다.
   *
   * 1. 무효화 메시지를 JSON 문자열로 변환합니다.
   * 2. 캐시 무효화 채널을 구독 중인 모든 서버에 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishCacheInvalidation(message: CacheInvalidationMessage): Promise<number> {
    const channel = RedisKey.channel.cacheInvalidation();
    // 발행 단계에서도 key 네임스페이스와 메시지 필드를 검증합니다.
    const validatedMessage = parseCacheInvalidation(message);

    // 반환값은 실제 캐시 삭제 건수가 아니라 현재 메시지를 받은 subscriber 수입니다.
    return redis.publish(channel, JSON.stringify(validatedMessage));
  }

  /**
   * 사용자 캐시 무효화 메시지를 구성해 발행합니다.
   *
   * 1. 사용자 ID로 무효화할 캐시 키를 생성합니다.
   * 2. 사용자 변경 사유와 현재 시각을 메시지에 기록합니다.
   * 3. 공용 캐시 무효화 발행 메서드에 전달합니다.
   */
  async publishUserCacheInvalidation(userId: number): Promise<number> {
    const key = RedisKey.cache.user(userId);

    return this.publishCacheInvalidation({
      type: 'USER_CACHE_INVALIDATED',
      key,
      reason: `User ${userId} updated`,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 지정한 Redis 키의 캐시 무효화 메시지를 발행합니다.
   *
   * 1. 입력받은 키와 사유로 사용자 정의 무효화 메시지를 구성합니다.
   * 2. 현재 시각을 이벤트 생성 시각으로 기록합니다.
   * 3. 공용 캐시 무효화 발행 메서드에 전달합니다.
   */
  async publishCustomKeyInvalidation(key: string, reason: string): Promise<number> {
    return this.publishCacheInvalidation({
      type: 'CUSTOM_KEY_INVALIDATED',
      key,
      reason,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 캐시 무효화 메시지 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 수신한 JSON 문자열을 캐시 무효화 메시지로 변환합니다.
   * 3. 메시지에 포함된 키를 삭제하고 선택적 콜백을 실행합니다.
   * 4. 구독 해제와 연결 종료를 수행하는 함수를 반환합니다.
   *
   * 참고:
   * 각 API 서버는 애플리케이션 시작 시 구독을 시작해 캐시 상태를 동기화할 수 있습니다.
   */
  async subscribeCacheInvalidation(
    onInvalidated?: (message: CacheInvalidationMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKey.channel.cacheInvalidation();

    // 구독 전용 연결을 만들어 일반 Redis 명령을 실행하는 공유 Client와 분리합니다.
    const subscriber = redis.duplicate();
    subscriber.on('error', (error) => {
      console.error('[CacheInvalidationPubSub] Subscriber error:', error);
    });

    try {
      await subscriber.connect();
      await subscriber.subscribe(channel, async (rawMessage) => {
        let message: CacheInvalidationMessage;

        // JSON 및 필드를 검증한 뒤에만 삭제 명령을 실행합니다.
        try {
          message = parseCacheInvalidation(parseJsonObject(rawMessage, 'CacheInvalidationMessage'));
        } catch (error) {
          console.error('[CacheInvalidationPubSub] Invalid message:', error);
          return;
        }

        // 검증 오류와 Redis DEL/후처리 콜백 오류를 서로 다른 로그로 남깁니다.
        try {
          // 키가 없어도 DEL은 오류 없이 0을 반환하므로 콜백을 계속 실행할 수 있습니다.
          await redis.del(message.key);
          if (onInvalidated) await onInvalidated(message);
        } catch (error) {
          console.error('[CacheInvalidationPubSub] Handler failed:', error);
        }
      });
    } catch (error) {
      // 연결 또는 구독 설정 실패 시 생성된 전용 연결을 정리하고 원래 오류를 다시 전달합니다.
      if (subscriber.isOpen) {
        await subscriber.quit().catch((closeError: unknown) => {
          console.error('[CacheInvalidationPubSub] Failed to close subscriber:', closeError);
        });
      }
      throw error;
    }

    // 애플리케이션 종료 경로가 겹치더라도 정리 작업을 중복 실행하지 않습니다.
    let closed = false;
    return async () => {
      if (closed) return;
      closed = true;

      if (!subscriber.isOpen) return;

      try {
        // 새 무효화 이벤트 수신을 먼저 중단합니다.
        await subscriber.unsubscribe(channel);
      } finally {
        // UNSUBSCRIBE 실패 여부와 관계없이 연결 종료를 시도합니다.
        if (subscriber.isOpen) await subscriber.quit();
      }
    };
  }
}
