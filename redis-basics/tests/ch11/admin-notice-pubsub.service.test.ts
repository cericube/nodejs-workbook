// tests/ch11/admin-notice-pubsub.service.test.ts

import { describe, expect, it, vi } from 'vitest';

import { AdminNoticePubSubService } from '../../src/ch11/admin-notice-pubsub.service.js';
import { redis } from '../../src/shared/redis.js';
import { RedisKey } from '../../src/shared/redis-key.js';

/** 관리자 공지의 실시간 발행, 메시지 검증과 구독 해제를 확인합니다. */
describe('AdminNoticePubSubService', () => {
  const service = new AdminNoticePubSubService();

  it('현재 구독자에게 관리자 공지를 전달한다', async () => {
    // Pub/Sub 콜백을 Promise로 감싸 테스트가 실제 메시지 수신까지 기다리게 합니다.
    let resolveMessage!: (value: unknown) => void;
    const received = new Promise((resolve) => {
      resolveMessage = resolve;
    });
    const stop = await service.subscribeAdminNotice(resolveMessage);

    try {
      // subscribe가 완료된 뒤 발행하므로 Redis Pub/Sub의 실시간 전달을 안정적으로 검증합니다.
      const subscriberCount = await service.publishInfoNotice({
        noticeId: 'notice-1',
        title: '점검 안내',
        content: '자정에 점검을 시작합니다.',
      });

      expect(subscriberCount).toBe(1);
      await expect(received).resolves.toMatchObject({
        noticeId: 'notice-1',
        level: 'INFO',
        title: '점검 안내',
      });
    } finally {
      // assertion 실패 여부와 관계없이 전용 subscriber 연결을 정리합니다.
      await stop();
    }
  });

  it('형식이 잘못된 메시지는 콜백에 전달하지 않는다', async () => {
    // 서비스가 오류를 기록할 때 resolve하여 비동기 메시지 처리 완료 시점을 동기화합니다.
    let resolveLogged!: () => void;
    const logged = new Promise<void>((resolve) => {
      resolveLogged = resolve;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => resolveLogged());
    const onMessage = vi.fn();
    const stop = await service.subscribeAdminNotice(onMessage);

    try {
      await redis.publish(
        RedisKey.channel.adminNotice(),
        JSON.stringify({ noticeId: 'notice-2', level: 'INVALID' }),
      );
      await logged;

      expect(onMessage).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        '[AdminNoticePubSub] Invalid message:',
        expect.any(TypeError),
      );
    } finally {
      // spy를 먼저 복원해 구독 종료 중 발생할 수 있는 로그가 가려지지 않게 합니다.
      errorSpy.mockRestore();
      await stop();
    }
  });

  it('반환된 종료 함수는 여러 번 호출해도 안전하다', async () => {
    const stop = await service.subscribeAdminNotice(vi.fn());

    // stop은 멱등적이어야 하며 구독 해제 뒤 PUBLISH의 수신자 수는 0입니다.
    await stop();
    await expect(stop()).resolves.toBeUndefined();
    await expect(
      service.publishUrgentNotice({ noticeId: 'notice-3', title: '긴급', content: '확인' }),
    ).resolves.toBe(0);
  });
});
