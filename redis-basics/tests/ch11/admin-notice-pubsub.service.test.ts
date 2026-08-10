import { describe, expect, it, vi } from 'vitest';
import { AdminNoticePubSubService } from '../../src/ch11/admin-notice-pubsub.service.js';
import { redis } from '../../src/shared/redis.js';
import { RedisKey } from '../../src/shared/redis-key.js';

describe('AdminNoticePubSubService', () => {
  const service = new AdminNoticePubSubService();

  it('현재 구독자에게 관리자 공지를 전달한다', async () => {
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
      await stop();
    }
  });

  it('형식이 잘못된 메시지는 콜백에 전달하지 않는다', async () => {
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
      errorSpy.mockRestore();
      await stop();
    }
  });

  it('반환된 종료 함수는 여러 번 호출해도 안전하다', async () => {
    const stop = await service.subscribeAdminNotice(vi.fn());

    await stop();
    await expect(stop()).resolves.toBeUndefined();
    await expect(
      service.publishUrgentNotice({ noticeId: 'notice-3', title: '긴급', content: '확인' }),
    ).resolves.toBe(0);
  });
});
