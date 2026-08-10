import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/** 이메일의 목적을 구분하고 worker의 발송 방식을 결정할 때 사용하는 작업 종류입니다. */
export type EmailJobType = 'welcome' | 'order-completed' | 'password-reset' | 'marketing';

/** Redis Stream에 새 이메일 작업을 기록할 때 전달하는 입력 데이터입니다. */
export type EmailJobInput = {
  to: string;
  type: EmailJobType;
  subject: string;
  body: string;
};

/** Redis Stream 메시지를 이메일 worker에서 사용할 수 있도록 변환한 작업 데이터입니다. */
export type EmailJob = {
  id: string;
  to: string;
  type: EmailJobType;
  subject: string;
  body: string;
  retryCount: number;
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
    throw new Error(`이메일 Stream 메시지의 ${field} 필드가 유효하지 않습니다.`);
  }

  return value;
}

/** Stream에 저장된 문자열이 지원하는 이메일 작업 종류인지 확인합니다. */
function isEmailJobType(value: string): value is EmailJobType {
  return ['welcome', 'order-completed', 'password-reset', 'marketing'].includes(value);
}

/**
 * Redis Stream 메시지를 이메일 작업 데이터로 변환합니다.
 *
 * 1. Redis가 생성한 Stream 메시지 ID를 작업 ID로 사용합니다.
 * 2. 문자열로 저장된 재시도 횟수를 number 타입으로 변환합니다.
 * 3. 필수 필드, 작업 종류와 재시도 횟수가 유효하지 않으면 오류를 발생시킵니다.
 *
 * 실습 포인트:
 * Redis Stream의 필드와 값은 문자열이므로 서비스 경계에서 필요한 타입으로 변환합니다.
 */
function parseEmailJob(entry: unknown): EmailJob {
  if (!isRecord(entry) || typeof entry.id !== 'string' || !isRecord(entry.message)) {
    throw new Error('이메일 Stream 항목의 형식이 유효하지 않습니다.');
  }

  const type = getRequiredStringField(entry.message, 'type');

  if (!isEmailJobType(type)) {
    throw new Error('이메일 Stream 메시지의 type 필드가 유효하지 않습니다.');
  }

  const retryCountValue = entry.message.retryCount ?? '0';

  if (typeof retryCountValue !== 'string') {
    throw new Error('이메일 Stream 메시지의 retryCount 필드가 유효하지 않습니다.');
  }

  const retryCount = Number(retryCountValue);

  if (!Number.isSafeInteger(retryCount) || retryCount < 0) {
    throw new Error('이메일 Stream 메시지의 retryCount 필드가 유효하지 않습니다.');
  }

  return {
    id: entry.id,
    to: getRequiredStringField(entry.message, 'to'),
    type,
    subject: getRequiredStringField(entry.message, 'subject'),
    body: getRequiredStringField(entry.message, 'body'),
    retryCount,
    createdAt: getRequiredStringField(entry.message, 'createdAt'),
  };
}

/** 이메일 발송 작업의 적재, 분산 소비, ACK 및 재등록을 관리하는 Stream 서비스입니다. */
export class EmailStreamService {
  /** 여러 이메일 worker가 공유하는 Consumer Group 이름입니다. */
  private readonly groupName = 'email-workers';

  /**
   * 이메일 발송 작업을 Redis Stream에 추가합니다.
   *
   * 1. 수신자, 작업 종류, 제목과 본문을 Stream 메시지 필드로 구성합니다.
   * 2. 최초 재시도 횟수를 0으로 설정하고 생성 시각을 기록합니다.
   * 3. Redis가 생성한 메시지 ID를 반환합니다.
   *
   * 실습 포인트:
   * 이메일 생성 요청과 실제 발송을 분리하면 요청 처리 중 외부 메일 서버의 응답을 기다리지 않아도 됩니다.
   *
   * 참고:
   * MAXLEN을 지정하지 않으므로 처리 완료 여부와 관계없이 Stream 항목은 계속 누적됩니다.
   */
  async addEmailJob(input: EmailJobInput): Promise<string> {
    const key = RedisKey.stream.emails();

    // '*'를 사용해 Redis가 고유한 Stream 메시지 ID를 생성하게 합니다.
    return redis.xAdd(key, '*', {
      to: input.to,
      type: input.type,
      subject: input.subject,
      body: input.body,
      retryCount: '0',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 회원가입 환영 이메일 작업을 생성합니다.
   *
   * 1. 수신자 이메일과 사용자 이름을 전달받습니다.
   * 2. 환영 이메일의 작업 종류, 제목과 본문을 구성합니다.
   * 3. 공통 이메일 작업 추가 메서드에 발송을 위임합니다.
   */
  async addWelcomeEmailJob(email: string, name: string): Promise<string> {
    return this.addEmailJob({
      to: email,
      type: 'welcome',
      subject: '회원가입을 환영합니다.',
      body: `${name}님, 회원가입을 환영합니다.`,
    });
  }

  /**
   * 주문 완료 안내 이메일 작업을 생성합니다.
   *
   * 1. 수신자 이메일과 주문 ID를 전달받습니다.
   * 2. 주문 완료 이메일의 작업 종류, 제목과 본문을 구성합니다.
   * 3. 공통 이메일 작업 추가 메서드에 발송을 위임합니다.
   */
  async addOrderCompletedEmailJob(email: string, orderId: number): Promise<string> {
    return this.addEmailJob({
      to: email,
      type: 'order-completed',
      subject: '주문이 완료되었습니다.',
      body: `주문 번호 ${orderId}의 주문이 완료되었습니다.`,
    });
  }

  /**
   * 이메일 worker가 공유할 Consumer Group을 생성합니다.
   *
   * 1. 이메일 Stream과 Consumer Group이 없으면 함께 생성합니다.
   * 2. `$`를 시작 ID로 사용해 그룹 생성 이후에 추가되는 메시지부터 처리합니다.
   * 3. 이미 그룹이 존재해서 발생한 BUSYGROUP 오류만 무시합니다.
   *
   * 실습 포인트:
   * Consumer Group을 사용하면 여러 이메일 worker가 같은 Stream의 새 작업을 나누어 처리할 수 있습니다.
   *
   * 참고:
   * BUSYGROUP 이외의 오류는 연결 장애나 잘못된 명령일 수 있으므로 호출자에게 다시 전달합니다.
   * `$`로 그룹을 생성하므로 이미 저장된 작업은 건너뛰며, 전체 이력을 처리하려면 시작 ID로 `0`을 사용해야 합니다.
   */
  async createConsumerGroup(): Promise<void> {
    const key = RedisKey.stream.emails();

    try {
      // MKSTREAM은 이메일 Stream이 없을 때 빈 Stream까지 함께 생성합니다.
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
   * Consumer Group에 전달되지 않은 새 이메일 작업을 읽습니다.
   *
   * 1. 호출한 worker를 Consumer Group의 consumer 이름으로 사용합니다.
   * 2. `>` ID로 아직 다른 consumer에게 전달되지 않은 메시지만 요청합니다.
   * 3. 최대 count개의 메시지를 1초 동안 기다려 읽고 이메일 작업 데이터로 변환합니다.
   *
   * 실습 포인트:
   * 읽은 메시지는 ACK 전까지 Consumer Group의 pending 목록에 남습니다.
   *
   * 참고:
   * 이 메서드를 호출하기 전에 createConsumerGroup으로 Consumer Group을 준비해야 합니다.
   * 대기 시간 안에 새 메시지가 없으면 Redis가 null을 반환하므로 빈 배열로 변환합니다.
   * `>`는 새 작업만 읽으므로 다른 worker가 남긴 Pending 작업은 XAUTOCLAIM 등으로 별도 회수해야 합니다.
   * BLOCK 중에는 해당 Redis 연결이 대기하므로 지속 실행 worker는 전용 연결을 사용하는 편이 안전합니다.
   */
  async readEmailJobs(consumerName: string, count = 5): Promise<EmailJob[]> {
    const key = RedisKey.stream.emails();

    // 새 작업이 없으면 최대 1초 대기하고, 응답은 unknown 상태에서 구조를 검증합니다.
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

    return stream.messages.map((entry: unknown) => parseEmailJob(entry));
  }

  /**
   * 발송을 완료한 이메일 작업을 Consumer Group에 확인 처리합니다.
   *
   * 1. 발송을 완료한 Stream 메시지 ID를 전달받습니다.
   * 2. Consumer Group에 ACK를 보내 해당 메시지를 pending 목록에서 제거합니다.
   *
   * 실습 포인트:
   * 이메일 발송에 성공한 뒤 ACK해야 장애가 발생했을 때 미완료 작업을 확인하거나 재처리할 수 있습니다.
   *
   * 참고:
   * XACK은 Pending 목록에서만 제거하며 Stream 원본 작업은 그대로 유지합니다.
   */
  async ackEmailJob(messageId: string): Promise<void> {
    const key = RedisKey.stream.emails();

    // Consumer Group의 PEL(Pending Entries List)에서 처리 완료한 메시지 ID를 제거합니다.
    await redis.xAck(key, this.groupName, messageId);
  }

  /**
   * 실패한 이메일 작업을 새 메시지로 다시 등록합니다.
   *
   * 1. 실패한 작업의 이메일 내용을 새 Stream 메시지에 복사합니다.
   * 2. 재시도 횟수를 1 증가시키고 새 생성 시각을 기록합니다.
   * 3. 원본 메시지 ID를 함께 저장해 재시도 작업의 출처를 추적합니다.
   *
   * 실습 포인트:
   * Stream 메시지는 직접 수정할 수 없으므로 변경된 재시도 정보를 가진 새 메시지를 추가합니다.
   *
   * 참고:
   * 이 메서드는 원본 메시지를 ACK하지 않습니다. 호출자는 재등록 성공 후 원본 작업을 별도로 ACK해야 합니다.
   * 실무에서는 지연 재시도, 재시도 전용 Stream, Dead Letter Stream 또는 전문 큐 사용을 고려할 수 있습니다.
   */
  async retryEmailJob(job: EmailJob): Promise<string> {
    const key = RedisKey.stream.emails();

    // Stream 항목은 수정할 수 없으므로 증가한 retryCount를 가진 새 항목으로 기록합니다.
    return redis.xAdd(key, '*', {
      to: job.to,
      type: job.type,
      subject: job.subject,
      body: job.body,
      retryCount: String(job.retryCount + 1),
      createdAt: new Date().toISOString(),
      originalMessageId: job.id,
    });
  }

  /**
   * Consumer Group의 처리 대기 상태를 요약해서 조회합니다.
   *
   * 1. ACK되지 않은 전체 이메일 작업 수를 조회합니다.
   * 2. 가장 오래된 ID, 가장 최근 ID와 consumer별 pending 개수를 함께 반환합니다.
   *
   * 실습 포인트:
   * pending 요약을 모니터링하면 worker 장애나 발송 지연으로 완료되지 않은 작업을 확인할 수 있습니다.
   *
   * 참고:
   * 이 메서드는 Pending 작업을 조회만 하며 회수하거나 재처리하지 않습니다.
   */
  async getPendingSummary() {
    const key = RedisKey.stream.emails();

    // Consumer Group이 없으면 Redis가 NOGROUP 오류를 반환합니다.
    return redis.xPending(key, this.groupName);
  }
}
