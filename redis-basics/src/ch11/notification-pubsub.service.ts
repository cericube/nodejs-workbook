import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import {
  parseJsonObject,
  requireEnum,
  requireIsoDate,
  requirePositiveInteger,
  requireRecord,
  requireString,
} from './pubsub-message.js';

const NOTIFICATION_TYPES = ['POST_LIKED', 'COMMENT_CREATED', 'ORDER_STATUS_CHANGED'] as const;

/** 알림 payload의 필드를 런타임에서 검증하고 도메인 메시지로 변환합니다. */
function parseNotification(value: unknown): RealtimeNotificationMessage {
  const message = requireRecord(value, 'RealtimeNotificationMessage');

  return {
    type: requireEnum(message, 'type', NOTIFICATION_TYPES, 'RealtimeNotificationMessage'),
    userId: requirePositiveInteger(message, 'userId', 'RealtimeNotificationMessage'),
    title: requireString(message, 'title', 'RealtimeNotificationMessage'),
    message: requireString(message, 'message', 'RealtimeNotificationMessage'),
    createdAt: requireIsoDate(message, 'createdAt', 'RealtimeNotificationMessage'),
  };
}

/**
 * Pub/Sub 채널로 전달하는 실시간 알림 메시지입니다.
 *
 * 알림 종류와 수신자, 화면에 표시할 내용, 생성 시각을 담습니다.
 * 이 타입은 컴파일 시점 계약이며, 외부에서 수신한 JSON에는 런타임 검증을 별도로 적용합니다.
 */
export type RealtimeNotificationMessage = {
  type: 'POST_LIKED' | 'COMMENT_CREATED' | 'ORDER_STATUS_CHANGED';
  userId: number;
  title: string;
  message: string;
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 알림을 실시간 발행하고 구독합니다.
 *
 * 실습 포인트:
 * 1. 일반 Redis 클라이언트로 알림을 발행합니다.
 * 2. 복제한 전용 클라이언트로 알림 채널을 구독합니다.
 * 3. 수신한 JSON 문자열을 알림 객체로 변환해 콜백에 전달합니다.
 *
 * 이 예제는 공용 알림 채널을 사용하므로 모든 구독자가 같은 메시지를 받습니다. 구독자는
 * `userId`를 기준으로 자신의 연결에 전달할지 판단해야 합니다. Pub/Sub은 메시지를 저장하지
 * 않으므로 오프라인 알림이 필요하면 DB나 Redis Streams를 함께 사용해야 합니다.
 */
export class NotificationPubSubService {
  /**
   * 실시간 알림을 공용 알림 채널에 발행합니다.
   *
   * 1. 알림 메시지를 JSON 문자열로 변환합니다.
   * 2. 알림 채널을 구독 중인 모든 구독자에게 문자열을 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishNotification(message: RealtimeNotificationMessage): Promise<number> {
    const channel = RedisKey.channel.notification();
    // 타입 단언이나 JavaScript 호출로 잘못된 값이 넘어와도 발행 전에 거부합니다.
    const payload = JSON.stringify(parseNotification(message));

    // 반환값은 알림을 처리한 사용자 수가 아니라 payload를 받은 subscriber 수입니다.
    return redis.publish(channel, payload);
  }

  /**
   * 게시글 좋아요 정보를 실시간 알림으로 발행합니다.
   *
   * 1. 수신자와 게시글 정보를 좋아요 알림 메시지로 구성합니다.
   * 2. 현재 시각을 알림 생성 시각으로 기록합니다.
   * 3. 공용 알림 발행 메서드에 메시지를 전달합니다.
   */
  async publishPostLikedNotification(input: {
    receiverUserId: number;
    postId: number;
    likedByUserName: string;
  }): Promise<number> {
    return this.publishNotification({
      type: 'POST_LIKED',
      userId: input.receiverUserId,
      title: '게시글 좋아요 알림',
      message: `${input.likedByUserName}님이 ${input.postId}번 게시글을 좋아합니다.`,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 댓글 작성 정보를 실시간 알림으로 발행합니다.
   *
   * 1. 수신자와 게시글 정보를 댓글 알림 메시지로 구성합니다.
   * 2. 현재 시각을 알림 생성 시각으로 기록합니다.
   * 3. 공용 알림 발행 메서드에 메시지를 전달합니다.
   */
  async publishCommentCreatedNotification(input: {
    receiverUserId: number;
    postId: number;
    commentAuthorName: string;
  }): Promise<number> {
    return this.publishNotification({
      type: 'COMMENT_CREATED',
      userId: input.receiverUserId,
      title: '댓글 알림',
      message: `${input.commentAuthorName}님이 ${input.postId}번 게시글에 댓글을 작성했습니다.`,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 실시간 알림 채널 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 알림 채널에서 받은 JSON 문자열을 알림 객체로 변환합니다.
   * 3. 변환한 알림을 콜백에 전달하고 구독 종료 함수를 반환합니다.
   *
   * 참고:
   * Pub/Sub 모드의 연결은 일반 Redis 명령 처리에 함께 사용하지 않습니다.
   *
   * @param onMessage 알림 메시지를 받았을 때 실행할 콜백
   * @returns 구독 종료 함수
   */
  async subscribeNotification(
    onMessage: (message: RealtimeNotificationMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKey.channel.notification();

    // Pub/Sub 구독은 일반 명령 처리와 분리된 전용 연결에서 수행합니다.
    const subscriber = redis.duplicate();
    subscriber.on('error', (error) => {
      console.error('[NotificationPubSub] Subscriber error:', error);
    });

    try {
      await subscriber.connect();
      await subscriber.subscribe(channel, async (rawMessage) => {
        let message: RealtimeNotificationMessage;

        // 신뢰할 수 없는 JSON을 파싱하고 필수 필드·enum·날짜 형식을 모두 확인합니다.
        try {
          message = parseNotification(parseJsonObject(rawMessage, 'RealtimeNotificationMessage'));
        } catch (error) {
          console.error('[NotificationPubSub] Invalid message:', error);
          return;
        }

        // 알림 후처리 실패가 구독 루프를 종료시키지 않도록 별도로 처리합니다.
        try {
          await onMessage(message);
        } catch (error) {
          console.error('[NotificationPubSub] Handler failed:', error);
        }
      });
    } catch (error) {
      // 연결 이후 구독 등록이 실패한 경우 열린 연결을 회수하고 실패를 호출자에게 알립니다.
      if (subscriber.isOpen) {
        await subscriber.quit().catch((closeError: unknown) => {
          console.error('[NotificationPubSub] Failed to close subscriber:', closeError);
        });
      }
      throw error;
    }

    // 종료 함수는 여러 번 호출되어도 동일한 결과를 내도록 멱등하게 구성합니다.
    let closed = false;
    return async () => {
      if (closed) return;
      closed = true;

      if (!subscriber.isOpen) return;

      try {
        // 새 알림 수신을 중단한 다음 전용 연결을 종료합니다.
        await subscriber.unsubscribe(channel);
      } finally {
        // UNSUBSCRIBE가 실패해도 열린 연결이 남지 않도록 QUIT을 시도합니다.
        if (subscriber.isOpen) await subscriber.quit();
      }
    };
  }
}
