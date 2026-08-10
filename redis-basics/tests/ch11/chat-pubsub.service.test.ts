// tests/ch11/chat-pubsub.service.test.ts

import { describe, expect, it, vi } from 'vitest';

import { ChatPubSubService } from '../../src/ch11/chat-pubsub.service.js';
import { redis } from '../../src/shared/redis.js';
import { RedisKey } from '../../src/shared/redis-key.js';

/** 채팅방별 채널 격리, 실시간 메시지 전달과 위조 payload 거부를 검증합니다. */
describe('ChatPubSubService', () => {
  const service = new ChatPubSubService();

  it('같은 채팅방의 구독자에게 메시지를 전달한다', async () => {
    // 콜백 결과를 Promise로 받아 PUBLISH 이후 실제 수신 내용까지 검증합니다.
    let resolveMessage!: (value: unknown) => void;
    const received = new Promise((resolve) => {
      resolveMessage = resolve;
    });
    const stop = await service.subscribeChatRoom('room-1', resolveMessage);

    try {
      await expect(
        service.sendMessage({
          roomId: 'room-1',
          senderUserId: 1,
          senderName: '홍길동',
          message: '안녕하세요.',
        }),
      ).resolves.toBe(1);

      await expect(received).resolves.toMatchObject({
        roomId: 'room-1',
        senderUserId: 1,
        message: '안녕하세요.',
      });
    } finally {
      await stop();
    }
  });

  it('다른 채팅방 채널의 구독자에게는 전달하지 않는다', async () => {
    // room-2의 수신 완료를 기다린 시점에도 room-1 handler가 호출되지 않아야 합니다.
    const roomOneHandler = vi.fn();
    let resolveRoomTwo!: () => void;
    const roomTwoReceived = new Promise<void>((resolve) => {
      resolveRoomTwo = resolve;
    });
    const stopRoomOne = await service.subscribeChatRoom('room-1', roomOneHandler);
    const stopRoomTwo = await service.subscribeChatRoom('room-2', () => resolveRoomTwo());

    try {
      await expect(
        service.sendMessage({
          roomId: 'room-2',
          senderUserId: 2,
          senderName: '김Redis',
          message: 'room-2 메시지',
        }),
      ).resolves.toBe(1);
      await roomTwoReceived;

      expect(roomOneHandler).not.toHaveBeenCalled();
    } finally {
      await stopRoomOne();
      await stopRoomTwo();
    }
  });

  it('채널과 payload의 채팅방 ID가 다르면 메시지를 거부한다', async () => {
    // 서비스의 sendMessage를 우회해 채널명과 roomId가 불일치하는 메시지를 주입합니다.
    let resolveLogged!: () => void;
    const logged = new Promise<void>((resolve) => {
      resolveLogged = resolve;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => resolveLogged());
    const onMessage = vi.fn();
    const stop = await service.subscribeChatRoom('room-1', onMessage);

    try {
      await redis.publish(
        RedisKey.channel.chat('room-1'),
        JSON.stringify({
          roomId: 'room-2',
          senderUserId: 1,
          senderName: '위조 사용자',
          message: '잘못된 방 메시지',
          createdAt: new Date().toISOString(),
        }),
      );
      // 오류 처리까지 기다린 뒤 사용자 콜백이 실행되지 않았는지 확인합니다.
      await logged;

      expect(onMessage).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('[ChatPubSub] Invalid message:', expect.any(TypeError));
    } finally {
      errorSpy.mockRestore();
      await stop();
    }
  });
});
