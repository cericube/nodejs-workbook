import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import {
  parseJsonObject,
  requireIsoDate,
  requirePositiveInteger,
  requireRecord,
  requireString,
} from './pubsub-message.js';

/** 외부 입력을 검증하여 채팅 처리에 사용할 수 있는 메시지로 변환합니다. */
function parseChatMessage(value: unknown): ChatMessage {
  const message = requireRecord(value, 'ChatMessage');

  return {
    roomId: requireString(message, 'roomId', 'ChatMessage'),
    senderUserId: requirePositiveInteger(message, 'senderUserId', 'ChatMessage'),
    senderName: requireString(message, 'senderName', 'ChatMessage'),
    message: requireString(message, 'message', 'ChatMessage'),
    createdAt: requireIsoDate(message, 'createdAt', 'ChatMessage'),
  };
}

/**
 * 채팅방 Pub/Sub 채널로 전달하는 채팅 메시지입니다.
 *
 * 채팅방과 발신자 정보, 메시지 내용, 생성 시각을 담습니다.
 * `senderUserId`는 양의 안전한 정수, `createdAt`은 UTC ISO 8601 문자열이어야 합니다.
 * 구독 시에는 메시지의 `roomId`가 실제 수신 채널의 방 ID와 같은지도 확인합니다.
 */
export type ChatMessage = {
  roomId: string;
  senderUserId: number;
  senderName: string;
  message: string;
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 채팅방 메시지를 실시간 발행하고 구독합니다.
 *
 * 실습 포인트:
 * 1. 채팅방 ID로 Pub/Sub 채널을 분리합니다.
 * 2. 같은 채팅방 채널을 구독 중인 구독자에게만 메시지를 전달합니다.
 * 3. 수신한 JSON 문자열을 채팅 메시지 객체로 변환해 콜백에 전달합니다.
 *
 * Pub/Sub은 채팅 이력과 오프라인 메시지를 저장하지 않습니다. 이력 조회나 재전송이
 * 필요하면 메시지를 DB에 저장하거나 Redis Streams를 함께 사용해야 합니다.
 */
export class ChatPubSubService {
  /**
   * 채팅 메시지를 해당 채팅방 채널에 발행합니다.
   *
   * 1. 채팅방 ID로 발행할 채널을 결정합니다.
   * 2. 채팅 메시지를 JSON 문자열로 변환해 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishChatMessage(message: ChatMessage): Promise<number> {
    // roomId를 채널 이름에 사용하기 전에 전체 메시지를 런타임에서 검증합니다.
    const validatedMessage = parseChatMessage(message);
    const channel = RedisKey.channel.chat(validatedMessage.roomId);

    // PUBLISH는 메시지를 받은 현재 구독자 수를 반환하며, 후속 처리 성공까지 보장하지 않습니다.
    return redis.publish(channel, JSON.stringify(validatedMessage));
  }

  /**
   * 입력값으로 채팅 메시지를 구성해 발행합니다.
   *
   * 1. 채팅방과 발신자 정보를 채팅 메시지로 구성합니다.
   * 2. 현재 시각을 메시지 생성 시각으로 기록합니다.
   * 3. 공용 채팅 메시지 발행 메서드에 전달합니다.
   *
   * 참고:
   * 채팅 이력이 필요하면 이 메서드 호출 전후에 DB 저장을 별도로 수행합니다.
   */
  async sendMessage(input: {
    roomId: string;
    senderUserId: number;
    senderName: string;
    message: string;
  }): Promise<number> {
    return this.publishChatMessage({
      roomId: input.roomId,
      senderUserId: input.senderUserId,
      senderName: input.senderName,
      message: input.message,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 특정 채팅방의 메시지 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 채팅방 채널에서 받은 JSON 문자열을 채팅 메시지로 변환합니다.
   * 3. 변환한 메시지를 콜백에 전달하고 구독 종료 함수를 반환합니다.
   *
   * 참고:
   * WebSocket 서버는 콜백에서 해당 채팅방에 접속한 클라이언트에게 메시지를 전달할 수 있습니다.
   */
  async subscribeChatRoom(
    roomId: string,
    onMessage: (message: ChatMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    // 빈 roomId가 채널 이름에 포함되지 않도록 구독 요청 자체를 먼저 검증합니다.
    const validatedRoomId = requireString({ roomId }, 'roomId', 'ChatSubscription');
    const channel = RedisKey.channel.chat(validatedRoomId);

    // Pub/Sub 수신은 공유 명령 Client와 분리한 전용 연결에서 처리합니다.
    const subscriber = redis.duplicate();
    subscriber.on('error', (error) => {
      console.error('[ChatPubSub] Subscriber error:', error);
    });

    try {
      await subscriber.connect();
      await subscriber.subscribe(channel, async (rawMessage) => {
        let message: ChatMessage;

        // payload가 유효하고 실제 구독 채널의 방 ID와 일치할 때만 콜백으로 전달합니다.
        try {
          message = parseChatMessage(parseJsonObject(rawMessage, 'ChatMessage'));
          if (message.roomId !== validatedRoomId) {
            throw new TypeError('ChatMessage.roomId does not match the subscribed channel');
          }
        } catch (error) {
          console.error('[ChatPubSub] Invalid message:', error);
          return;
        }

        // 사용자 콜백 오류는 메시지 형식 오류와 분리해 기록하고 구독은 계속 유지합니다.
        try {
          await onMessage(message);
        } catch (error) {
          console.error('[ChatPubSub] Handler failed:', error);
        }
      });
    } catch (error) {
      // SUBSCRIBE 준비 중 실패하면 열린 전용 연결을 정리한 뒤 오류를 호출자에게 전달합니다.
      if (subscriber.isOpen) {
        await subscriber.quit().catch((closeError: unknown) => {
          console.error('[ChatPubSub] Failed to close subscriber:', closeError);
        });
      }
      throw error;
    }

    // 동일한 종료 함수가 중복 호출되어도 연결 정리는 한 번만 수행합니다.
    let closed = false;
    return async () => {
      if (closed) return;
      closed = true;

      if (!subscriber.isOpen) return;

      try {
        // 채널 구독을 먼저 해제해 이후 메시지가 콜백으로 전달되지 않게 합니다.
        await subscriber.unsubscribe(channel);
      } finally {
        // 구독 해제 실패 시에도 전용 연결 종료를 시도합니다.
        if (subscriber.isOpen) await subscriber.quit();
      }
    };
  }
}
