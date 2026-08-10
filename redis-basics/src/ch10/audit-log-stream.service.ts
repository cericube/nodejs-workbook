import { prisma } from '../shared/prisma.js';
import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/** 감사 로그 Stream에 기록할 행위, 대상, 설명과 선택적 행위자 ID입니다. */
export type AuditLogEventInput = {
  action: string;
  target: string;
  message: string;
  actorId?: number;
};

/** Redis Stream 항목을 검증하고 애플리케이션 타입으로 변환한 감사 로그 작업입니다. */
export type AuditLogJob = {
  id: string;
  action: string;
  target: string;
  message: string;
  actorId: number | null;
  createdAt: string;
};

/** Redis 클라이언트가 반환한 외부 값이 필드 접근 가능한 객체인지 확인합니다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 메시지의 필수 문자열 필드를 읽고 누락되거나 빈 값이면 손상된 이벤트로 처리합니다. */
function getRequiredStringField(message: Record<string, unknown>, field: string): string {
  const value = message[field];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`감사 로그 Stream 메시지의 ${field} 필드가 유효하지 않습니다.`);
  }

  return value;
}

/**
 * Stream 메시지를 감사 로그 작업 데이터로 변환합니다.
 *
 * 1. Stream 메시지 ID를 작업 ID로 사용합니다.
 * 2. 행위자 ID가 있으면 number 타입으로 변환하고, 없으면 null로 처리합니다.
 * 3. 필수 필드가 누락되거나 타입이 다르면 잘못된 작업을 처리하지 않도록 오류를 발생시킵니다.
 */
function parseAuditLogJob(entry: unknown): AuditLogJob {
  if (!isRecord(entry) || typeof entry.id !== 'string' || !isRecord(entry.message)) {
    throw new Error('감사 로그 Stream 항목의 형식이 유효하지 않습니다.');
  }

  const actorIdValue = entry.message.actorId;
  let actorId: number | null = null;

  if (actorIdValue !== undefined && actorIdValue !== '') {
    if (typeof actorIdValue !== 'string') {
      throw new Error('감사 로그 Stream 메시지의 actorId 필드가 유효하지 않습니다.');
    }

    actorId = Number(actorIdValue);

    if (!Number.isSafeInteger(actorId)) {
      throw new Error('감사 로그 Stream 메시지의 actorId 필드가 유효하지 않습니다.');
    }
  }

  return {
    id: entry.id,
    action: getRequiredStringField(entry.message, 'action'),
    target: getRequiredStringField(entry.message, 'target'),
    message: getRequiredStringField(entry.message, 'message'),
    actorId,
    createdAt: getRequiredStringField(entry.message, 'createdAt'),
  };
}

/**
 * 감사 로그를 Stream에 적재하고 Consumer Group worker가 DB에 저장하도록 지원합니다.
 *
 * Stream은 비동기 전달과 Pending 추적을 담당하고, AuditLog 테이블은 영구 원본을 담당합니다.
 */
export class AuditLogStreamService {
  /** 여러 감사 로그 worker가 공유하는 Consumer Group 이름입니다. */
  private readonly groupName = 'audit-log-workers';

  /**
   * 감사 로그 이벤트를 비동기 저장 작업으로 등록합니다.
   *
   * 1. 사용자 행위나 관리자 작업 정보를 Stream 메시지로 구성합니다.
   * 2. 행위자 ID가 없으면 빈 문자열로 저장합니다.
   * 3. XADD가 생성한 메시지 ID를 호출자에게 반환합니다.
   *
   * 실습 포인트:
   * API 요청과 DB 저장을 분리하면 감사 로그 저장을 worker에서 비동기로 처리할 수 있습니다.
   *
   * 참고:
   * MAXLEN을 지정하지 않으므로 Stream은 자동으로 정리되지 않습니다.
   */
  async addAuditLogEvent(input: AuditLogEventInput): Promise<string> {
    const key = RedisKey.stream.auditLogs();

    // '*'는 서버 시각을 기준으로 단조 증가하는 Stream ID를 Redis가 생성하게 합니다.
    return redis.xAdd(key, '*', {
      action: input.action,
      target: input.target,
      message: input.message,
      actorId: input.actorId !== undefined ? String(input.actorId) : '',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 감사 로그 worker가 공유할 Consumer Group을 생성합니다.
   *
   * 1. `$`를 시작 ID로 사용해 그룹 생성 이후에 추가되는 새 이벤트부터 처리합니다.
   * 2. Stream이 없으면 함께 생성합니다.
   * 3. 이미 그룹이 존재하는 경우에는 오류 없이 종료합니다.
   *
   * 참고:
   * Consumer Group을 사용하면 여러 worker가 감사 로그 작업을 나누어 처리할 수 있습니다.
   * 그룹 생성 전에 Stream에 있던 이벤트도 처리해야 한다면 시작 ID를 `0`으로 바꿔야 합니다.
   */
  async createConsumerGroup(): Promise<void> {
    const key = RedisKey.stream.auditLogs();

    try {
      // MKSTREAM은 Stream이 아직 없어도 빈 Stream과 Consumer Group을 함께 생성합니다.
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
   * 아직 다른 worker에게 전달되지 않은 새 감사 로그 작업을 읽습니다.
   *
   * 1. 호출한 worker 이름으로 Consumer Group에 참여합니다.
   * 2. `>`로 아직 어떤 consumer에도 전달되지 않은 메시지만 요청합니다.
   * 3. 새 메시지를 최대 count개까지 1초 동안 기다립니다.
   * 4. Redis 응답을 검증해 감사 로그 작업 데이터로 변환합니다.
   *
   * 참고:
   * 읽은 작업은 DB 저장 후 ACK하기 전까지 Pending 상태로 유지됩니다.
   * `>`는 기존 Pending 작업을 반환하지 않으므로 장애 worker의 작업 회수에는 XAUTOCLAIM 등이 필요합니다.
   * BLOCK 명령은 호출한 Redis 연결을 대기시키므로 운영 worker에서는 전용 연결을 고려합니다.
   */
  async readAuditLogJobs(consumerName: string, count = 10): Promise<AuditLogJob[]> {
    const key = RedisKey.stream.auditLogs();

    // 새 메시지가 없으면 최대 1초 대기한 뒤 null을 반환합니다.
    // 클라이언트 응답은 신뢰 경계 밖의 값이므로 unknown 상태에서 구조를 확인합니다.
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

    return stream.messages.map((entry: unknown) => parseAuditLogJob(entry));
  }

  /**
   * 감사 로그 작업을 DB에 저장하고 완료 처리합니다.
   *
   * 1. Stream에서 읽은 감사 로그 작업을 AuditLog 테이블에 저장합니다.
   * 2. DB 저장에 성공한 작업만 Consumer Group에 완료 처리합니다.
   * 3. 저장에 실패한 작업은 ACK하지 않아 Pending 상태로 남깁니다.
   *
   * 실습 포인트:
   * Stream은 worker가 읽은 뒤 ACK하지 않은 메시지를 Pending 상태로 관리합니다.
   * 따라서 실패한 작업을 추적할 수 있습니다.
   *
   * 참고:
   * DB 저장 후 ACK가 실패하면 재처리 시 같은 로그가 중복 저장될 수 있으므로 실무에서는 메시지 ID 기반 멱등 처리가 필요합니다.
   */
  async saveAuditLogToDatabase(job: AuditLogJob) {
    const auditLog = await prisma.auditLog.create({
      data: {
        action: job.action,
        target: job.target,
        message: job.message,
      },
    });

    await this.ackAuditLogJob(job.id);

    return auditLog;
  }

  /**
   * DB 저장이 끝난 감사 로그 작업을 완료 처리합니다.
   *
   * 1. 처리한 Stream 메시지 ID를 전달받습니다.
   * 2. XACK으로 Consumer Group의 Pending 목록에서 해당 작업을 제거합니다.
   *
   * 참고:
   * XACK은 Pending 상태만 해제하며 Stream 원본 메시지를 삭제하지 않습니다.
   */
  async ackAuditLogJob(messageId: string): Promise<void> {
    const key = RedisKey.stream.auditLogs();

    // 반환되는 ACK 처리 개수는 사용하지 않고 완료 여부만 반영합니다.
    await redis.xAck(key, this.groupName, messageId);
  }

  /**
   * Stream에 저장된 최근 감사 로그 이벤트를 조회합니다.
   *
   * 1. 가장 최근 메시지부터 역순으로 조회합니다.
   * 2. 최대 count개의 메시지를 감사 로그 작업 데이터로 변환합니다.
   *
   * 실습 포인트:
   * Consumer Group과 관계없이 Stream 원본을 조회하므로 디버깅이나 테스트에 사용할 수 있습니다.
   * 이 조회는 메시지를 Pending 상태로 만들거나 Consumer Group의 전달 위치를 변경하지 않습니다.
   */
  async getRecentAuditLogEvents(count = 10): Promise<AuditLogJob[]> {
    const key = RedisKey.stream.auditLogs();

    // XREVRANGE는 ID가 큰 최신 항목부터 역순으로 반환합니다.
    const entries = await redis.xRevRange(key, '+', '-', {
      COUNT: count,
    });

    return entries.map(parseAuditLogJob);
  }

  /**
   * 아직 완료되지 않은 감사 로그 작업을 요약해서 조회합니다.
   *
   * 1. Consumer Group에서 ACK되지 않은 전체 작업 수를 확인합니다.
   * 2. 메시지 ID 범위와 worker별 Pending 작업 수를 함께 조회합니다.
   *
   * 참고:
   * XPENDING 요약은 관찰 용도이며 작업 소유권을 이전하거나 재처리하지 않습니다.
   */
  async getPendingSummary() {
    const key = RedisKey.stream.auditLogs();

    // Consumer Group이 없으면 Redis가 NOGROUP 오류를 반환합니다.
    return redis.xPending(key, this.groupName);
  }
}
