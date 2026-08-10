// src/ch07/job-list.service.ts

import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/**
 * 간단한 작업 큐에서 처리할 수 있는 작업 종류입니다.
 *
 * 각 값은 작업을 꺼낸 소비자(worker)가 어떤 처리를 해야 하는지 구분하는 식별자로 사용합니다.
 */
export type SimpleJobType = 'SEND_EMAIL' | 'SEND_NOTIFICATION' | 'RESIZE_IMAGE';

/**
 * 작업 실행에 필요한 부가 데이터입니다.
 *
 * 작업 종류마다 필요한 값이 다르므로 optional 필드로 두고, 실제 처리 시 type에 맞는 값을 사용합니다.
 */
export type SimpleJobPayload = {
  email?: string;
  userId?: number;
  imageUrl?: string;
  message?: string;
};

/**
 * Redis List에 JSON 문자열로 저장되는 작업 데이터입니다.
 *
 * Redis에는 문자열로 직렬화되어 들어가지만, 서비스 밖으로는 이 객체 형태로 반환합니다.
 */
export type SimpleJob = {
  id: string;
  type: SimpleJobType;
  payload: SimpleJobPayload;
  createdAt: string;
};

/**
 * 작업을 큐에 넣을 때 호출자가 전달하는 입력 데이터입니다.
 *
 * id와 createdAt은 서비스에서 생성하므로 입력에는 포함하지 않습니다.
 */
export type EnqueueJobInput = {
  type: SimpleJobType;
  payload: SimpleJobPayload;
};

/**
 * 작업을 구분하기 위한 간단한 ID를 생성합니다.
 *
 * 1. 현재 시간을 넣어 대략적인 생성 시점을 포함합니다.
 * 2. 짧은 랜덤 문자열을 붙여 같은 시각에 만든 작업끼리도 충돌 가능성을 낮춥니다.
 *
 * 참고:
 * 실무에서는 UUID, DB sequence, Redis INCR 같은 더 명확한 ID 생성 방식을 사용할 수 있습니다.
 */
function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Redis에서 꺼낸 JSON 문자열을 SimpleJob 객체로 변환합니다.
 *
 * 1. JSON.parse로 문자열을 객체로 바꿉니다.
 * 2. 파싱에 실패하면 잘못된 큐 데이터로 보고 null을 반환합니다.
 *
 * 참고:
 * 이 예제에서는 타입 단언만 사용합니다. 실제 서비스에서는 type, payload 같은 필드 검증을 추가하는 편이 안전합니다.
 */
function parseSimpleJob(value: string): SimpleJob | null {
  try {
    return JSON.parse(value) as SimpleJob;
  } catch {
    return null;
  }
}

/** LPUSH와 RPOP을 조합해 먼저 들어온 작업을 먼저 처리하는 간단한 FIFO 큐입니다. */
export class JobListService {
  /**
   * 새 작업을 Redis List 큐에 추가합니다.
   *
   * 1. 작업 큐에 사용할 Redis key를 만듭니다.
   * 2. 작업 ID와 생성 시각을 포함한 SimpleJob 객체를 만듭니다.
   * 3. 작업 객체를 JSON 문자열로 변환합니다.
   * 4. Redis List 왼쪽에 작업을 넣습니다.
   *
   * 실습 포인트:
   * Redis List는 문자열 목록이므로 객체를 저장하려면 JSON.stringify()로 직렬화해야 합니다.
   *
   * 참고:
   * 이 서비스는 LPUSH로 왼쪽에 넣고 RPOP으로 오른쪽에서 꺼내 FIFO 큐처럼 사용합니다.
   */
  async enqueueJob(input: EnqueueJobInput): Promise<SimpleJob> {
    const key = RedisKey.list.simpleJobQueue();

    const job: SimpleJob = {
      id: createJobId(),
      type: input.type,
      payload: input.payload,
      createdAt: new Date().toISOString(),
    };

    // 비동기 작업 큐의 최신 위치에 새 항목을 추가합니다.
    // 목록 왼쪽에 값을 추가하고 추가 후 전체 항목 수를 반환합니다.
    await redis.lPush(key, JSON.stringify(job));

    return job;
  }

  /**
   * 큐에서 처리할 작업을 하나 꺼냅니다.
   *
   * 1. 작업 큐에 사용할 Redis key를 만듭니다.
   * 2. Redis List 오른쪽에서 작업 문자열을 하나 제거하면서 가져옵니다.
   * 3. 큐가 비어 있으면 null을 반환합니다.
   * 4. JSON 문자열을 SimpleJob 객체로 변환해 반환합니다.
   *
   * 실습 포인트:
   * LPUSH로 넣은 작업을 RPOP으로 꺼내면 먼저 들어온 작업이 오른쪽 끝에 있으므로 먼저 처리됩니다.
   *
   * 참고:
   * RPOP은 값을 조회만 하는 명령이 아니라 List에서 제거까지 함께 수행합니다.
   */
  async dequeueJob(): Promise<SimpleJob | null> {
    const key = RedisKey.list.simpleJobQueue();

    // 비동기 작업 큐에서 가장 오래된 작업을 꺼냅니다.
    // 목록 오른쪽 끝 값을 제거해 반환하며, 대기 작업이 없으면 null을 반환합니다.
    const value = await redis.rPop(key);

    if (!value) {
      return null;
    }

    return parseSimpleJob(value);
  }

  /**
   * 큐에 대기 중인 작업 목록을 조회합니다.
   *
   * 1. 작업 큐에 사용할 Redis key를 만듭니다.
   * 2. Redis List 왼쪽부터 limit개까지 작업 문자열을 읽습니다.
   * 3. JSON 문자열 목록을 SimpleJob 객체 목록으로 변환합니다.
   * 4. JSON 파싱에 실패한 값은 결과에서 제외합니다.
   *
   * 실습 포인트:
   * LRANGE는 List 데이터를 삭제하지 않고 지정한 구간만 조회합니다.
   *
   * 참고:
   * 이 메서드는 작업을 처리하지 않고 현재 큐 상태를 확인하는 용도에 가깝습니다.
   */
  async getPendingJobs(limit = 20): Promise<SimpleJob[]> {
    const key = RedisKey.list.simpleJobQueue();

    // 비동기 작업 큐에서 필요한 범위의 항목을 조회합니다.
    // 지정한 범위의 값을 순서대로 반환하며, 저장된 항목이 없으면 빈 배열을 반환합니다.
    const values = await redis.lRange(key, 0, limit - 1);

    return values.map(parseSimpleJob).filter((job): job is SimpleJob => job !== null);
  }

  /**
   * 큐에 남아 있는 대기 작업 수를 조회합니다.
   *
   * 1. 작업 큐에 사용할 Redis key를 만듭니다.
   * 2. Redis List의 현재 길이를 조회합니다.
   *
   * 실습 포인트:
   * LLEN은 List에 들어 있는 값의 개수를 반환합니다.
   */
  async getPendingJobCount(): Promise<number> {
    const key = RedisKey.list.simpleJobQueue();

    // 비동기 작업 큐에 저장된 항목 수를 조회합니다.
    // 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    return redis.lLen(key);
  }

  /**
   * 작업 큐 전체를 초기화합니다.
   *
   * 1. 작업 큐에 사용할 Redis key를 만듭니다.
   * 2. Redis에서 해당 List key를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key 자체를 삭제하므로 List 안의 모든 대기 작업이 함께 사라집니다.
   *
   * 참고:
   * 테스트 준비나 예제 재실행 전에 큐를 비울 때 사용할 수 있습니다.
   */
  async clearQueue(): Promise<void> {
    const key = RedisKey.list.simpleJobQueue();

    // 비동기 작업 큐 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
