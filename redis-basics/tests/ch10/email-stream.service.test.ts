// tests/ch10/email-stream.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { EmailStreamService } from '../../src/ch10/email-stream.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

/** 이메일 Stream의 작업 생성, 분산 소비, ACK와 재시도 메시지 생성을 검증합니다. */
describe('EmailStreamService', () => {
  const service = new EmailStreamService();

  beforeEach(async () => {
    // `$` 이후의 새 작업을 읽는 그룹이므로 이메일 작업보다 먼저 생성합니다.
    await service.createConsumerGroup();
  });

  it('이메일 작업을 추가하고 문자열 필드를 worker 작업으로 변환한다', async () => {
    const messageId = await service.addEmailJob({
      to: 'user@example.com',
      type: 'password-reset',
      subject: '비밀번호 재설정',
      body: '재설정 링크를 확인해 주세요.',
    });

    const jobs = await service.readEmailJobs('email-worker-1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: messageId,
      to: 'user@example.com',
      type: 'password-reset',
      retryCount: 0,
    });
  });

  it('업무별 보조 메서드로 환영 및 주문 완료 작업을 생성한다', async () => {
    await service.addWelcomeEmailJob('welcome@example.com', 'Redis');
    await service.addOrderCompletedEmailJob('order@example.com', 100);

    const jobs = await service.readEmailJobs('email-worker-1', 2);

    expect(jobs.map((job) => job.type)).toEqual(['welcome', 'order-completed']);
    expect(jobs[0]?.body).toContain('Redis님');
    expect(jobs[1]?.body).toContain('100');
  });

  it('ACK 전후의 Pending 작업 수를 반영한다', async () => {
    await service.addWelcomeEmailJob('pending@example.com', 'Pending');
    const [job] = await service.readEmailJobs('email-worker-1');
    expect(job).toBeDefined();
    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 1 });

    await service.ackEmailJob(job!.id);

    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 0 });
  });

  it('실패한 작업을 증가한 retryCount를 가진 새 메시지로 등록한다', async () => {
    await service.addEmailJob({
      to: 'retry@example.com',
      type: 'marketing',
      subject: '재시도',
      body: '재시도 본문',
    });
    const [originalJob] = await service.readEmailJobs('email-worker-1');
    expect(originalJob).toBeDefined();

    // 재시도 등록은 원본을 ACK하지 않으므로 호출자가 성공 후 명시적으로 ACK합니다.
    await service.retryEmailJob(originalJob!);
    await service.ackEmailJob(originalJob!.id);
    const [retryJob] = await service.readEmailJobs('email-worker-2');

    expect(retryJob).toMatchObject({
      to: 'retry@example.com',
      type: 'marketing',
      retryCount: 1,
    });
    expect(retryJob?.id).not.toBe(originalJob?.id);
  });

  it('지원하지 않는 이메일 작업 종류를 거부한다', async () => {
    await redis.xAdd(RedisKey.stream.emails(), '*', {
      to: 'invalid@example.com',
      type: 'unknown',
      subject: '잘못된 작업',
      body: '잘못된 본문',
      retryCount: '0',
      createdAt: new Date().toISOString(),
    });

    await expect(service.readEmailJobs('email-worker-1')).rejects.toThrow('type 필드');
  });
});
