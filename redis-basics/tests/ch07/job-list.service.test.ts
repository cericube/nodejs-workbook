// tests/ch07/job-list.service.test.ts

import { describe, expect, it } from 'vitest';

import { JobListService } from '../../src/ch07/job-list.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

/** 작업의 직렬화와 FIFO 처리, 조회, 초기화 동작을 검증합니다. */
describe('JobListService', () => {
  const service = new JobListService();

  it('작업 ID와 생성 시각을 만들어 큐에 저장한다', async () => {
    const job = await service.enqueueJob({
      type: 'SEND_EMAIL',
      payload: { email: 'user@example.com' },
    });

    expect(job).toMatchObject({
      type: 'SEND_EMAIL',
      payload: { email: 'user@example.com' },
    });
    expect(job.id).toMatch(/^job_\d+_[a-z0-9]+$/);
    expect(Number.isNaN(Date.parse(job.createdAt))).toBe(false);
    await expect(service.getPendingJobCount()).resolves.toBe(1);
  });

  it('먼저 추가한 작업부터 꺼내는 FIFO 순서를 유지한다', async () => {
    const first = await service.enqueueJob({
      type: 'SEND_EMAIL',
      payload: { email: 'first@example.com' },
    });
    const second = await service.enqueueJob({
      type: 'SEND_NOTIFICATION',
      payload: { userId: 1, message: '두 번째 작업' },
    });

    await expect(service.dequeueJob()).resolves.toEqual(first);
    await expect(service.dequeueJob()).resolves.toEqual(second);
    await expect(service.dequeueJob()).resolves.toBeNull();
  });

  it('대기 작업은 최신 작업부터 조회하고 잘못된 JSON은 제외한다', async () => {
    const first = await service.enqueueJob({
      type: 'RESIZE_IMAGE',
      payload: { imageUrl: 'a.jpg' },
    });
    const second = await service.enqueueJob({
      type: 'RESIZE_IMAGE',
      payload: { imageUrl: 'b.jpg' },
    });

    // 외부에서 손상된 값이 들어온 상황을 만들어 파싱 실패 처리도 함께 확인합니다.
    await redis.rPush(RedisKey.list.simpleJobQueue(), 'invalid-json');

    await expect(service.getPendingJobs()).resolves.toEqual([second, first]);
  });

  it('작업 큐 전체를 삭제한다', async () => {
    await service.enqueueJob({ type: 'SEND_NOTIFICATION', payload: { userId: 1 } });

    await service.clearQueue();

    await expect(service.getPendingJobCount()).resolves.toBe(0);
    await expect(service.dequeueJob()).resolves.toBeNull();
  });
});
