import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import { assertFiniteScore } from './zset-validation.js';

/** 우선순위 큐에 작업을 등록할 때 사용하는 입력 데이터입니다. */
export type PriorityJobInput = {
  jobId: string;
  priority: number;
  // Record<string, unknown>은 문자열 key와 사용 전에 타입 확인이 필요한 value로 구성된 객체를 뜻합니다.
  payload?: Record<string, unknown>;
};

/** 큐에서 조회하거나 꺼낸 작업의 ID와 우선순위를 반환하는 응답 데이터입니다. */
export type PriorityJobOutput = {
  jobId: string;
  priority: number;
};

/** 낮은 score를 먼저 처리하는 Redis Sorted Set 기반 우선순위 큐 서비스입니다. */
export class PriorityQueueService {
  /**
   * 작업을 우선순위 큐에 추가하고 선택적인 payload를 별도로 저장합니다.
   *
   * 1. jobId를 Sorted Set의 member로 사용합니다.
   * 2. priority를 score로 저장하며 낮은 값일수록 먼저 처리합니다.
   * 3. payload가 있으면 JSON 문자열로 변환해 1시간 동안 별도 key에 저장합니다.
   *
   * 실습 포인트:
   * Sorted Set은 score 기준 정렬을 제공하므로 우선순위 큐를 간단히 만들 수 있습니다.
   */
  async addJob(input: PriorityJobInput): Promise<void> {
    // Redis 명령을 실행하기 전에 유효하지 않은 우선순위를 차단합니다.
    assertFiniteScore(input.priority, '작업 우선순위');

    const key = RedisKey.zset.priorityQueue();
    const payloadKey = this.getPayloadKey(input.jobId);

    // 큐 member와 별도 payload가 서로 다른 상태로 남지 않도록 Transaction을 시작합니다.
    const transaction = redis.multi().zAdd(key, {
      value: input.jobId,
      score: input.priority,
    });

    if (input.payload !== undefined) {
      // payload는 큐와 별도 String key에 JSON으로 저장하고 1시간 뒤 만료시킵니다.
      transaction.set(payloadKey, JSON.stringify(input.payload), {
        EX: 60 * 60,
      });
    } else {
      // 같은 jobId를 payload 없이 다시 등록하면 과거 payload가 남지 않게 삭제합니다.
      transaction.del(payloadKey);
    }

    // MULTI/EXEC에 등록한 큐와 payload 명령을 다른 클라이언트 명령이 끼어들지 않게 실행합니다.
    await transaction.exec();
  }

  /**
   * 큐에서 가장 우선순위가 높은 작업을 제거하지 않고 조회합니다.
   *
   * 1. ZRANGE로 score가 가장 낮은 작업 한 개를 조회합니다.
   * 2. 작업이 없으면 null을 반환합니다.
   * 3. 조회한 member와 score를 작업 응답 데이터로 변환합니다.
   *
   * 참고:
   * 조회만 수행하므로 같은 작업은 큐에서 제거되기 전까지 반복해서 반환됩니다.
   */
  async peekNextJob(): Promise<PriorityJobOutput | null> {
    const key = RedisKey.zset.priorityQueue();

    // 점수가 가장 낮은 작업 하나를 제거하지 않고 조회합니다.
    const items = await redis.zRangeWithScores(key, 0, 0);
    const job = items[0];

    if (job === undefined) {
      return null;
    }

    return {
      jobId: job.value,
      priority: job.score,
    };
  }

  /**
   * 큐에서 가장 우선순위가 높은 작업을 조회한 뒤 제거합니다.
   *
   * 1. score가 가장 낮은 작업 1개를 조회합니다.
   * 2. 조회와 제거를 원자적으로 실행합니다.
   * 3. 큐가 비어 있으면 null을 반환합니다.
   *
   * 실습 포인트:
   * ZPOPMIN을 사용하면 여러 worker가 동시에 접근해도 각 작업을 한 번만 꺼낼 수 있습니다.
   */
  async popNextJob(): Promise<PriorityJobOutput | null> {
    const key = RedisKey.zset.priorityQueue();

    // 가장 낮은 점수의 작업을 조회하고 제거하는 과정을 원자적으로 수행합니다.
    const job = await redis.zPopMin(key);

    if (job === null) {
      return null;
    }

    return {
      jobId: job.value,
      priority: job.score,
    };
  }

  /**
   * 작업 ID에 연결된 payload를 조회하고 요청한 타입으로 변환합니다.
   *
   * 1. 작업별 payload key에서 JSON 문자열을 조회합니다.
   * 2. payload가 없거나 만료되었으면 null을 반환합니다.
   * 3. JSON 문자열을 파싱해 호출자가 지정한 타입으로 반환합니다.
   *
   * 실습 포인트:
   * Sorted Set에는 jobId와 priority만 저장하고 payload는 별도 String key에 저장합니다.
   *
   * 참고:
   * 제네릭 타입 T는 컴파일 시점의 타입 단언이며, JSON 데이터의 실제 구조를 런타임에 검증하지는 않습니다.
   */
  async getJobPayload<T>(jobId: string): Promise<T | null> {
    // 저장된 우선순위 작업 큐 값을 조회합니다.
    // 저장된 값이 없으면 null을 반환합니다.
    const payload = await redis.get(this.getPayloadKey(jobId));

    if (!payload) {
      return null;
    }

    return JSON.parse(payload) as T;
  }

  /**
   * 작업 처리가 끝난 뒤 별도로 저장한 payload를 삭제합니다.
   *
   * 1. popNextJob에서 Sorted Set member가 이미 제거된 것으로 봅니다.
   * 2. 작업 ID에 해당하는 payload key만 삭제합니다.
   */
  async completeJob(jobId: string): Promise<void> {
    // 작업 처리가 끝났으므로 큐에서 이미 꺼낸 작업의 별도 payload만 삭제합니다.
    await redis.del(this.getPayloadKey(jobId));
  }

  /**
   * 특정 작업과 연결된 payload를 큐에서 함께 제거합니다.
   *
   * 1. ZREM으로 Sorted Set에서 jobId를 제거합니다.
   * 2. 별도 key에 저장된 payload도 삭제합니다.
   *
   * 참고:
   * 작업이나 payload가 존재하지 않아도 제거 명령은 오류를 발생시키지 않습니다.
   */
  async removeJob(jobId: string): Promise<void> {
    const key = RedisKey.zset.priorityQueue();

    // 큐 member와 payload를 한 Transaction에서 함께 제거해 중간 상태 노출을 막습니다.
    await redis.multi().zRem(key, jobId).del(this.getPayloadKey(jobId)).exec();
  }

  /**
   * 현재 우선순위 큐에서 대기 중인 작업 수를 조회합니다.
   *
   * 1. 우선순위 큐에 사용하는 Sorted Set key를 가져옵니다.
   * 2. ZCARD로 저장된 전체 member 수를 반환합니다.
   */
  async getQueueSize(): Promise<number> {
    const key = RedisKey.zset.priorityQueue();

    // 우선순위 작업 큐에 등록된 작업 수를 조회합니다.
    // 전체 작업 수를 반환하며, 큐가 없으면 0을 반환합니다.
    return redis.zCard(key);
  }

  /**
   * 우선순위 큐의 모든 대기 작업을 초기화합니다.
   *
   * 1. 우선순위 큐에 사용하는 Sorted Set key를 가져옵니다.
   * 2. DEL로 key를 삭제해 모든 작업과 priority score를 제거합니다.
   *
   * 참고:
   * 작업별 payload는 별도 key에 저장되므로 이 메서드에서 즉시 삭제되지 않고 설정된 TTL에 따라 만료됩니다.
   */
  async clearQueue(): Promise<void> {
    const key = RedisKey.zset.priorityQueue();

    // 우선순위 작업 큐 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }

  /**
   * 작업 payload를 저장할 Redis key를 생성합니다.
   *
   * 1. 고정된 namespace 뒤에 jobId를 붙여 작업별 key를 만듭니다.
   * 2. 이 서비스 내부에서만 사용하는 보조 key로 관리합니다.
   *
   * 참고:
   * 여러 서비스에서 같은 key 형식이 필요해지면 redis-key.ts로 이동하는 것을 고려할 수 있습니다.
   */
  private getPayloadKey(jobId: string): string {
    return `zset:priority-queue:payload:${jobId}`;
  }
}
