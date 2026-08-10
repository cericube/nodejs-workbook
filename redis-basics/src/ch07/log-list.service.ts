// src/ch07/log-list.service.ts

import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/**
 * 로그 버퍼에 저장할 수 있는 로그 레벨입니다.
 *
 * 로그를 조회할 때 ERROR만 따로 필터링하는 기준 값으로도 사용합니다.
 */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/**
 * Redis List에 JSON 문자열로 저장되는 로그 데이터입니다.
 *
 * Redis에는 문자열로 직렬화되어 저장되지만, 서비스 밖으로는 이 객체 형태로 반환합니다.
 */
export type LogBufferEntry = {
  level: LogLevel;
  message: string;
  context?: Record<string, string | number | boolean | null> | undefined;
  createdAt: string;
};

/**
 * 로그를 추가할 때 호출자가 전달하는 입력 데이터입니다.
 *
 * createdAt은 서비스에서 생성하므로 입력에는 포함하지 않습니다.
 */
export type AddLogInput = {
  level: LogLevel;
  message: string;
  context?: Record<string, string | number | boolean | null>;
};

/**
 * Redis에서 읽은 JSON 문자열을 로그 객체로 변환합니다.
 *
 * 1. JSON.parse로 문자열을 객체로 바꿉니다.
 * 2. 파싱에 실패하면 잘못된 로그 데이터로 보고 null을 반환합니다.
 *
 * 참고:
 * 이 예제에서는 타입 단언만 사용합니다. 실제 서비스에서는 level, message, createdAt 같은 필드 검증을 추가하는 편이 안전합니다.
 */
function parseLogEntry(value: string): LogBufferEntry | null {
  try {
    return JSON.parse(value) as LogBufferEntry;
  } catch {
    return null;
  }
}

/** Redis List에 최근 N개의 로그만 유지하는 제한 크기 로그 버퍼입니다. */
export class LogListService {
  /**
   * 새 로그를 Redis List 버퍼에 추가합니다.
   *
   * 1. 로그 버퍼에 사용할 Redis key를 만듭니다.
   * 2. 로그 레벨, 메시지, context, 생성 시각을 포함한 로그 객체를 만듭니다.
   * 3. 로그 객체를 JSON 문자열로 변환합니다.
   * 4. Redis List 왼쪽에 로그를 넣어 최신 로그가 앞쪽에 오게 합니다.
   * 5. LTRIM으로 최근 limit개만 남기고 오래된 로그를 제거합니다.
   *
   * 실습 포인트:
   * Redis List는 최근 N개의 로그만 유지하는 버퍼로 활용할 수 있습니다.
   *
   * 참고:
   * 이 예제는 로그 원본 저장소가 아니라 최근 로그 확인용 짧은 버퍼를 Redis에 두는 방식입니다.
   * LPUSH와 LTRIM은 MULTI/EXEC으로 묶어 로그 추가와 개수 제한을 연속 실행합니다.
   */
  async addLog(input: AddLogInput, limit = 100): Promise<LogBufferEntry> {
    const key = RedisKey.list.logBuffer();

    const entry: LogBufferEntry = {
      level: input.level,
      message: input.message,
      context: input.context,
      createdAt: new Date().toISOString(),
    };

    // 로그 추가와 개수 제한을 하나의 Transaction으로 실행합니다.
    // 다른 명령이 LPUSH와 LTRIM 사이에 끼어들지 않아 제한을 초과한 중간 상태가 노출되지 않습니다.
    await redis
      .multi()
      .lPush(key, JSON.stringify(entry))
      .lTrim(key, 0, limit - 1)
      .exec();

    return entry;
  }

  /**
   * Redis List에서 최근 로그 목록을 최신순으로 조회합니다.
   *
   * 1. 로그 버퍼에 사용할 Redis key를 만듭니다.
   * 2. Redis List의 앞쪽부터 limit개만 읽습니다.
   * 3. JSON 문자열 목록을 로그 객체 목록으로 변환합니다.
   * 4. JSON 파싱에 실패한 값은 결과에서 제외합니다.
   *
   * 실습 포인트:
   * LRANGE는 List 데이터를 삭제하지 않고 지정한 구간만 조회합니다.
   *
   * 참고:
   * LPUSH로 최신 로그를 왼쪽에 넣었으므로 0번 인덱스부터 읽으면 최신 로그부터 조회됩니다.
   */
  async getRecentLogs(limit = 100): Promise<LogBufferEntry[]> {
    const key = RedisKey.list.logBuffer();

    // 최근 로그 버퍼에서 필요한 범위의 항목을 조회합니다.
    // 지정한 범위의 값을 순서대로 반환하며, 저장된 항목이 없으면 빈 배열을 반환합니다.
    const values = await redis.lRange(key, 0, limit - 1);

    return values.map(parseLogEntry).filter((entry): entry is LogBufferEntry => entry !== null);
  }

  /**
   * 최근 로그 중 ERROR 레벨 로그만 조회합니다.
   *
   * 1. getRecentLogs로 최근 로그 목록을 가져옵니다.
   * 2. level 값이 ERROR인 로그만 남깁니다.
   *
   * 실습 포인트:
   * Redis List에서는 최근 로그 순서를 관리하고, 레벨 필터링은 애플리케이션 코드에서 처리합니다.
   */
  async getRecentErrorLogs(limit = 100): Promise<LogBufferEntry[]> {
    const logs = await this.getRecentLogs(limit);

    return logs.filter((log) => log.level === 'ERROR');
  }

  /**
   * 로그 버퍼에 남아 있는 로그 개수를 조회합니다.
   *
   * 1. 로그 버퍼에 사용할 Redis key를 만듭니다.
   * 2. Redis List의 현재 길이를 조회합니다.
   *
   * 실습 포인트:
   * LLEN은 List에 들어 있는 값의 개수를 반환합니다.
   */
  async getLogCount(): Promise<number> {
    const key = RedisKey.list.logBuffer();

    // 최근 로그 버퍼에 저장된 항목 수를 조회합니다.
    // 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    return redis.lLen(key);
  }

  /**
   * 로그 버퍼 전체를 초기화합니다.
   *
   * 1. 로그 버퍼에 사용할 Redis key를 만듭니다.
   * 2. Redis에서 해당 List key를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key 자체를 삭제하므로 List 안의 모든 로그가 함께 사라집니다.
   */
  async clearLogs(): Promise<void> {
    const key = RedisKey.list.logBuffer();

    // 최근 로그 버퍼 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
