// tests/ch09/priority-queue.service.test.ts

import { describe, expect, it } from 'vitest';

import { PriorityQueueService } from '../../src/ch09/priority-queue.service.js';
import { redis } from '../../src/shared/redis.js';

/** Sorted Set 우선순위 큐의 원자적 pop, payload 수명과 입력 검증을 확인합니다. */
describe('PriorityQueueService', () => {
  const service = new PriorityQueueService();

  it('낮은 priority 값을 가진 작업부터 조회하고 원자적으로 제거한다', async () => {
    await service.addJob({ jobId: 'low-priority', priority: 10 });
    await service.addJob({ jobId: 'high-priority', priority: 1 });

    // peek은 조회만 수행하므로 호출 뒤에도 큐 크기가 유지되어야 합니다.
    await expect(service.peekNextJob()).resolves.toEqual({
      jobId: 'high-priority',
      priority: 1,
    });
    await expect(service.getQueueSize()).resolves.toBe(2);

    // pop은 ZPOPMIN으로 조회와 제거를 한 명령에서 수행합니다.
    await expect(service.popNextJob()).resolves.toEqual({
      jobId: 'high-priority',
      priority: 1,
    });
    await expect(service.getQueueSize()).resolves.toBe(1);
  });

  it('여러 worker가 동시에 pop해도 각 작업을 한 번씩 반환한다', async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        service.addJob({ jobId: `job-${index}`, priority: index }),
      ),
    );

    // 동시에 실행한 pop 결과에 중복 ID나 null이 없어야 원자성이 보장된 것입니다.
    const jobs = await Promise.all(Array.from({ length: 5 }, () => service.popNextJob()));

    expect(jobs).not.toContain(null);
    expect(new Set(jobs.map((job) => job?.jobId)).size).toBe(5);
    await expect(service.getQueueSize()).resolves.toBe(0);
  });

  it('payload를 저장하고 작업 완료 시 삭제한다', async () => {
    await service.addJob({
      jobId: 'payload-job',
      priority: 1,
      payload: { email: 'worker@example.com' },
    });

    await expect(service.getJobPayload('payload-job')).resolves.toEqual({
      email: 'worker@example.com',
    });
    // 큐 member와 별도 key에 저장된 payload의 1시간 TTL도 함께 검증합니다.
    const ttl = await redis.ttl('zset:priority-queue:payload:payload-job');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60);

    await service.completeJob('payload-job');
    await expect(service.getJobPayload('payload-job')).resolves.toBeNull();
  });

  it('같은 jobId를 payload 없이 재등록하면 이전 payload를 제거한다', async () => {
    await service.addJob({ jobId: 'reused-job', priority: 1, payload: { old: true } });

    // 재등록 Transaction의 DEL 분기가 과거 payload를 남기지 않아야 합니다.
    await service.addJob({ jobId: 'reused-job', priority: 2 });

    await expect(service.getJobPayload('reused-job')).resolves.toBeNull();
    await expect(service.peekNextJob()).resolves.toEqual({ jobId: 'reused-job', priority: 2 });
  });

  it('유한하지 않은 priority를 거부한다', async () => {
    await expect(service.addJob({ jobId: 'invalid', priority: Number.NaN })).rejects.toThrow(
      '유한한 숫자',
    );
    await expect(service.getQueueSize()).resolves.toBe(0);
  });

  it('작업과 payload를 함께 제거하고 큐를 초기화한다', async () => {
    await service.addJob({ jobId: 'remove-job', priority: 1, payload: { remove: true } });
    await service.addJob({ jobId: 'clear-job', priority: 2 });

    // removeJob은 Sorted Set member와 payload key를 같은 Transaction에서 제거합니다.
    await service.removeJob('remove-job');
    await expect(service.getJobPayload('remove-job')).resolves.toBeNull();
    await expect(service.getQueueSize()).resolves.toBe(1);

    await service.clearQueue();
    await expect(service.getQueueSize()).resolves.toBe(0);
    await expect(service.popNextJob()).resolves.toBeNull();
  });
});
