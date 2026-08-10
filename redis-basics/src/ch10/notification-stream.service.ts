import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/** 알림 작업을 구분하고 worker의 처리 방식을 결정할 때 사용하는 이벤트 종류입니다. */
export type NotificationType = 'order.created' | 'post.liked' | 'comment.created' | 'admin.notice';

/** Redis Stream에 새 알림 작업을 기록할 때 전달하는 입력 데이터입니다. */
export type NotificationEventInput = {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
};

/** Redis Stream 메시지를 알림 worker에서 사용할 수 있도록 변환한 작업 데이터입니다. */
export type NotificationJob = {
  id: string;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
};

/** unknown 값이 문자열 key를 가진 객체인지 확인합니다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Stream 메시지에서 필수 문자열 필드를 읽고 누락되거나 타입이 다른 값을 거부합니다. */
function getRequiredStringField(message: Record<string, unknown>, field: string): string {
  const value = message[field];

  if (typeof value !== 'string') {
    throw new Error(`알림 Stream 메시지의 ${field} 필드가 유효하지 않습니다.`);
  }

  return value;
}

/** Stream에 저장된 문자열이 지원하는 알림 종류인지 확인합니다. */
function isNotificationType(value: string): value is NotificationType {
  return ['order.created', 'post.liked', 'comment.created', 'admin.notice'].includes(value);
}

/**
 * Redis Stream 메시지를 알림 작업 응답으로 변환합니다.
 *
 * 1. Redis가 생성한 Stream 메시지 ID를 작업 ID로 사용합니다.
 * 2. 문자열로 저장된 사용자 ID를 number 타입으로 변환합니다.
 * 3. 필수 필드, 사용자 ID와 알림 종류가 유효하지 않으면 오류를 발생시킵니다.
 *
 * 실습 포인트:
 * Redis Stream의 필드와 값은 문자열로 저장되므로 서비스 경계에서 필요한 타입으로 변환합니다.
 */
function parseNotificationJob(entry: unknown): NotificationJob {
  if (!isRecord(entry) || typeof entry.id !== 'string' || !isRecord(entry.message)) {
    throw new Error('알림 Stream 항목의 형식이 유효하지 않습니다.');
  }

  const userId = Number(getRequiredStringField(entry.message, 'userId'));

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('알림 Stream 메시지의 userId 필드가 유효하지 않습니다.');
  }

  const type = getRequiredStringField(entry.message, 'type');

  if (!isNotificationType(type)) {
    throw new Error('알림 Stream 메시지의 type 필드가 유효하지 않습니다.');
  }

  return {
    id: entry.id,
    userId,
    type,
    title: getRequiredStringField(entry.message, 'title'),
    message: getRequiredStringField(entry.message, 'message'),
    createdAt: getRequiredStringField(entry.message, 'createdAt'),
  };
}

/** 사용자 알림을 Stream에 적재하고 Consumer Group으로 분산 처리하는 서비스입니다. */
export class NotificationStreamService {
  /** 여러 알림 worker가 공유하는 Consumer Group 이름입니다. */
  private readonly groupName = 'notification-workers';

  /**
   * 알림 작업을 Redis Stream에 추가합니다.
   *
   * 1. 알림 대상 사용자와 알림 내용을 Stream 메시지 필드로 구성합니다.
   * 2. 사용자 ID를 Redis에 저장할 문자열로 변환합니다.
   * 3. Redis가 생성한 메시지 ID를 반환합니다.
   *
   * 실습 포인트:
   * Stream에 기록된 작업은 worker가 즉시 실행 중이지 않아도 나중에 Consumer Group으로 읽을 수 있습니다.
   *
   * 참고:
   * MAXLEN을 지정하지 않으므로 Stream 항목은 ACK 이후에도 자동 삭제되지 않고 계속 누적됩니다.
   */
  async addNotificationEvent(input: NotificationEventInput): Promise<string> {
    const key = RedisKey.stream.notifications();

    // '*'를 사용해 Redis가 고유한 Stream 메시지 ID를 생성하게 합니다.
    return redis.xAdd(key, '*', {
      userId: String(input.userId),
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 알림 worker가 공유할 Consumer Group을 생성합니다.
   *
   * 1. 알림 Stream과 Consumer Group이 없으면 함께 생성합니다.
   * 2. `$`를 시작 ID로 사용해 그룹 생성 이후에 추가되는 메시지부터 처리합니다.
   * 3. 이미 그룹이 존재해서 발생한 BUSYGROUP 오류만 무시합니다.
   *
   * 실습 포인트:
   * Consumer Group을 사용하면 여러 worker가 같은 Stream의 새 메시지를 나누어 처리할 수 있습니다.
   *
   * 참고:
   * BUSYGROUP 이외의 오류는 연결 장애나 잘못된 명령일 수 있으므로 호출자에게 다시 전달합니다.
   * `$`는 기존 항목을 마지막 전달 위치로 보므로 그룹 생성 전에 저장된 알림은 소비하지 않습니다.
   */
  async createConsumerGroup(): Promise<void> {
    const key = RedisKey.stream.notifications();

    try {
      // MKSTREAM은 알림 Stream이 없을 때 빈 Stream까지 함께 생성합니다.
      await redis.xGroupCreate(key, this.groupName, '$', {
        MKSTREAM: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        return;
      }

      throw error;
    }
  }

  /**
   * Consumer Group에 전달되지 않은 새 알림 작업을 읽습니다.
   *
   * 1. 호출한 worker를 Consumer Group의 consumer 이름으로 사용합니다.
   * 2. `>` ID로 아직 다른 consumer에게 전달되지 않은 메시지만 요청합니다.
   * 3. 최대 count개의 메시지를 1초 동안 기다려 읽고 알림 작업 데이터로 변환합니다.
   *
   * 실습 포인트:
   * 읽은 메시지는 ACK 전까지 Consumer Group의 pending 목록에 남습니다.
   *
   * 참고:
   * 이 메서드를 호출하기 전에 createConsumerGroup으로 Consumer Group을 준비해야 합니다.
   * 대기 시간 안에 새 메시지가 없으면 Redis가 null을 반환하므로 빈 배열로 변환합니다.
   * `>`는 새 메시지만 읽으므로 장애 consumer의 Pending 메시지는 XAUTOCLAIM 등으로 회수해야 합니다.
   * BLOCK 중에는 해당 Redis 연결이 대기하므로 장기 실행 worker에서는 전용 연결을 고려합니다.
   */
  async readNotificationJobs(consumerName: string, count = 10): Promise<NotificationJob[]> {
    const key = RedisKey.stream.notifications();

    // 새 메시지가 없으면 최대 1초 대기하고, 응답은 unknown 상태에서 구조를 검증합니다.
    const result: unknown = await redis.xReadGroup(
      this.groupName,
      consumerName,
      [
        {
          key,
          id: '>',
        },
      ],
      {
        COUNT: count,
        BLOCK: 1000,
      },
    );

    if (!Array.isArray(result)) {
      return [];
    }

    const stream: unknown = result[0];

    if (!isRecord(stream) || !Array.isArray(stream.messages)) {
      return [];
    }

    return stream.messages.map((entry: unknown) => parseNotificationJob(entry));
  }

  /**
   * 처리 완료한 알림 작업을 Consumer Group에 확인 처리합니다.
   *
   * 1. 처리한 Stream 메시지 ID를 전달받습니다.
   * 2. Consumer Group에 ACK를 보내 해당 메시지를 pending 목록에서 제거합니다.
   *
   * 실습 포인트:
   * 작업이 성공한 뒤 ACK해야 worker 장애 시 미완료 작업을 pending 목록에서 확인하거나 재처리할 수 있습니다.
   *
   * 참고:
   * XACK은 Consumer Group의 Pending 상태만 제거하며 Stream 원본 메시지는 삭제하지 않습니다.
   */
  async ackNotificationJob(messageId: string): Promise<void> {
    const key = RedisKey.stream.notifications();

    // Consumer Group의 PEL에서 처리 완료한 메시지 ID를 제거합니다.
    await redis.xAck(key, this.groupName, messageId);
  }

  /**
   * Consumer Group의 처리 대기 상태를 요약해서 조회합니다.
   *
   * 1. ACK되지 않은 전체 메시지 수를 조회합니다.
   * 2. 가장 오래된 ID, 가장 최근 ID와 consumer별 pending 개수를 함께 반환합니다.
   *
   * 실습 포인트:
   * pending 요약을 모니터링하면 worker 장애나 처리 지연으로 ACK되지 않은 작업을 확인할 수 있습니다.
   *
   * 참고:
   * XPENDING 요약은 관찰 용도이며 메시지를 다른 consumer로 이전하지 않습니다.
   */
  async getPendingSummary() {
    const key = RedisKey.stream.notifications();

    // Consumer Group이 없으면 Redis가 NOGROUP 오류를 반환합니다.
    return redis.xPending(key, this.groupName);
  }
}
