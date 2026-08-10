import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import {
  parseJsonObject,
  requireEnum,
  requireIsoDate,
  requireRecord,
  requireString,
} from './pubsub-message.js';

const ADMIN_NOTICE_LEVELS = ['INFO', 'WARNING', 'URGENT'] as const;

/** 외부에서 들어온 값을 검증하여 안전한 관리자 공지 메시지로 변환합니다. */
function parseAdminNotice(value: unknown): AdminNoticeMessage {
  const message = requireRecord(value, 'AdminNoticeMessage');

  return {
    noticeId: requireString(message, 'noticeId', 'AdminNoticeMessage'),
    title: requireString(message, 'title', 'AdminNoticeMessage'),
    content: requireString(message, 'content', 'AdminNoticeMessage'),
    level: requireEnum(message, 'level', ADMIN_NOTICE_LEVELS, 'AdminNoticeMessage'),
    createdAt: requireIsoDate(message, 'createdAt', 'AdminNoticeMessage'),
  };
}

/**
 * 관리자 공지 채널로 전달하는 공지 메시지입니다.
 *
 * 공지 식별자와 표시 내용, 중요도, 생성 시각을 담습니다.
 * `createdAt`은 `Date#toISOString()`으로 만든 UTC ISO 8601 문자열을 사용합니다.
 * TypeScript 타입은 런타임에 사라지므로 실제 발행과 수신 시에는 별도 검증을 수행합니다.
 */
export type AdminNoticeMessage = {
  noticeId: string;
  title: string;
  content: string;
  level: 'INFO' | 'WARNING' | 'URGENT';
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 관리자 공지를 실시간 발행하고 구독합니다.
 *
 * 실습 포인트:
 * 1. 관리자가 작성한 공지를 공용 채널에 발행합니다.
 * 2. 공지 채널을 구독 중인 모든 구독자가 같은 메시지를 받습니다.
 * 3. 수신한 JSON 문자열을 공지 객체로 변환해 콜백에 전달합니다.
 *
 * Redis Pub/Sub은 발행 시점에 연결된 구독자에게만 메시지를 전달합니다. 공지 이력이나
 * 재처리가 필요하다면 DB 또는 Redis Streams 같은 영속 저장소를 함께 사용해야 합니다.
 */
export class AdminNoticePubSubService {
  /**
   * 관리자 공지를 공용 공지 채널에 발행합니다.
   *
   * 1. 관리자 공지를 JSON 문자열로 변환합니다.
   * 2. 공지 채널을 구독 중인 모든 구독자에게 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishAdminNotice(message: AdminNoticeMessage): Promise<number> {
    const channel = RedisKey.channel.adminNotice();
    // 호출자가 타입 검사를 우회했을 가능성까지 고려하여 직렬화 전에 다시 검증합니다.
    const validatedMessage = parseAdminNotice(message);

    // PUBLISH의 반환값은 처리 성공 건수가 아니라 메시지를 전달받은 구독자 수입니다.
    return redis.publish(channel, JSON.stringify(validatedMessage));
  }

  /**
   * 입력값으로 일반 공지를 구성해 발행합니다.
   *
   * 1. 공지 식별자와 표시 내용을 메시지로 구성합니다.
   * 2. 중요도를 INFO로, 생성 시각을 현재 시각으로 설정합니다.
   * 3. 공용 관리자 공지 발행 메서드에 전달합니다.
   */
  async publishInfoNotice(input: {
    noticeId: string;
    title: string;
    content: string;
  }): Promise<number> {
    return this.publishAdminNotice({
      noticeId: input.noticeId,
      title: input.title,
      content: input.content,
      level: 'INFO',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 입력값으로 긴급 공지를 구성해 발행합니다.
   *
   * 1. 공지 식별자와 표시 내용을 메시지로 구성합니다.
   * 2. 중요도를 URGENT로, 생성 시각을 현재 시각으로 설정합니다.
   * 3. 공용 관리자 공지 발행 메서드에 전달합니다.
   */
  async publishUrgentNotice(input: {
    noticeId: string;
    title: string;
    content: string;
  }): Promise<number> {
    return this.publishAdminNotice({
      noticeId: input.noticeId,
      title: input.title,
      content: input.content,
      level: 'URGENT',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 관리자 공지 채널 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 공지 채널에서 받은 JSON 문자열을 공지 메시지로 변환합니다.
   * 3. 변환한 공지를 콜백에 전달하고 구독 종료 함수를 반환합니다.
   */
  async subscribeAdminNotice(
    onMessage: (message: AdminNoticeMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKey.channel.adminNotice();

    // Pub/Sub 구독 연결은 일반 명령 연결과 분리하여 연결 상태와 수명 주기를 독립적으로 관리합니다.
    const subscriber = redis.duplicate();
    // node-redis Client에는 연결 중 발생할 수 있는 error 이벤트 listener가 필요합니다.
    subscriber.on('error', (error) => {
      console.error('[AdminNoticePubSub] Subscriber error:', error);
    });

    try {
      await subscriber.connect();
      await subscriber.subscribe(channel, async (rawMessage) => {
        let message: AdminNoticeMessage;

        // JSON 구문과 모든 필드를 먼저 검증하여 잘못된 payload가 업무 콜백에 도달하지 않게 합니다.
        try {
          message = parseAdminNotice(parseJsonObject(rawMessage, 'AdminNoticeMessage'));
        } catch (error) {
          console.error('[AdminNoticePubSub] Invalid message:', error);
          return;
        }

        // 메시지 검증 실패와 애플리케이션 콜백 실패를 구분하여 원인을 진단하기 쉽게 합니다.
        try {
          await onMessage(message);
        } catch (error) {
          console.error('[AdminNoticePubSub] Handler failed:', error);
        }
      });
    } catch (error) {
      // 연결 후 SUBSCRIBE가 실패한 경우에도 복제 Client의 연결을 남기지 않습니다.
      if (subscriber.isOpen) {
        await subscriber.quit().catch((closeError: unknown) => {
          console.error('[AdminNoticePubSub] Failed to close subscriber:', closeError);
        });
      }
      throw error;
    }

    // 종료 함수를 여러 곳에서 호출해도 UNSUBSCRIBE와 QUIT은 한 번만 실행합니다.
    let closed = false;
    return async () => {
      if (closed) return;
      closed = true;

      if (!subscriber.isOpen) return;

      try {
        // 먼저 채널 구독을 해제하여 새 메시지 전달을 중단합니다.
        await subscriber.unsubscribe(channel);
      } finally {
        // 구독 해제 중 오류가 발생해도 전용 연결은 가능한 한 정상 종료합니다.
        if (subscriber.isOpen) await subscriber.quit();
      }
    };
  }
}
