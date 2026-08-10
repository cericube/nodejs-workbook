// tests/ch11/notification-pubsub.service.test.ts

import { describe, expect, it, vi } from 'vitest';

import { NotificationPubSubService } from '../../src/ch11/notification-pubsub.service.js';
import { redis } from '../../src/shared/redis.js';
import { RedisKey } from '../../src/shared/redis-key.js';

/** 공용 알림 채널의 fan-out 전달, 구독자 수와 수신 메시지 검증을 확인합니다. */
describe('NotificationPubSubService', () => {
  const service = new NotificationPubSubService();

  it('좋아요 알림을 현재 구독자에게 전달한다', async () => {
    // 구독 콜백을 Promise의 resolve로 연결해 비동기 수신 결과를 assertion에 사용합니다.
    let resolveMessage!: (value: unknown) => void;
    const received = new Promise((resolve) => {
      resolveMessage = resolve;
    });
    const stop = await service.subscribeNotification(resolveMessage);

    try {
      await expect(
        service.publishPostLikedNotification({
          receiverUserId: 1,
          postId: 10,
          likedByUserName: '홍길동',
        }),
      ).resolves.toBe(1);

      await expect(received).resolves.toMatchObject({
        type: 'POST_LIKED',
        userId: 1,
        title: '게시글 좋아요 알림',
      });
    } finally {
      await stop();
    }
  });

  it('공용 채널을 구독한 모든 구독자에게 같은 알림을 전달한다', async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstReceived = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const secondReceived = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const stopFirst = await service.subscribeNotification(() => resolveFirst());
    const stopSecond = await service.subscribeNotification(() => resolveSecond());

    try {
      const subscriberCount = await service.publishCommentCreatedNotification({
        receiverUserId: 2,
        postId: 20,
        commentAuthorName: '김Redis',
      });

      // Redis PUBLISH 반환값은 메시지를 받은 구독자 수이므로 fan-out 규모도 확인할 수 있습니다.
      expect(subscriberCount).toBe(2);
      await Promise.all([firstReceived, secondReceived]);
    } finally {
      await stopFirst();
      await stopSecond();
    }
  });

  it('유효하지 않은 사용자 ID를 포함한 메시지는 거부한다', async () => {
    // 공개 publish 메서드의 입력 검증을 우회해 구독 측 런타임 검증을 직접 시험합니다.
    let resolveLogged!: () => void;
    const logged = new Promise<void>((resolve) => {
      resolveLogged = resolve;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => resolveLogged());
    const onMessage = vi.fn();
    const stop = await service.subscribeNotification(onMessage);

    try {
      await redis.publish(
        RedisKey.channel.notification(),
        JSON.stringify({
          type: 'POST_LIKED',
          userId: 0,
          title: '잘못된 알림',
          message: '수신자가 없습니다.',
          createdAt: new Date().toISOString(),
        }),
      );
      // 오류 로그가 남을 때까지 기다려 비동기 콜백과 assertion 사이의 경쟁을 피합니다.
      await logged;

      expect(onMessage).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        '[NotificationPubSub] Invalid message:',
        expect.any(TypeError),
      );
    } finally {
      errorSpy.mockRestore();
      await stop();
    }
  });
});
