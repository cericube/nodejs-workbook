// tests/ch10/audit-log-stream.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { AuditLogStreamService } from '../../src/ch10/audit-log-stream.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

/** 감사 로그 Stream의 적재, Consumer Group 소비, DB 저장과 메시지 검증을 확인합니다. */
describe('AuditLogStreamService', () => {
  const service = new AuditLogStreamService();

  beforeEach(async () => {
    // 그룹의 시작 ID가 `$`이므로 테스트 메시지를 추가하기 전에 그룹을 먼저 생성합니다.
    await service.createConsumerGroup();
  });

  it('감사 로그 이벤트를 worker 작업으로 읽는다', async () => {
    const messageId = await service.addAuditLogEvent({
      action: 'USER_LOGIN',
      target: 'user:1',
      message: '사용자가 로그인했습니다.',
      actorId: 1,
    });

    const jobs = await service.readAuditLogJobs('audit-worker-1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: messageId,
      action: 'USER_LOGIN',
      target: 'user:1',
      message: '사용자가 로그인했습니다.',
      actorId: 1,
    });
    expect(Date.parse(jobs[0]?.createdAt ?? '')).not.toBeNaN();
  });

  it('actorId가 없는 이벤트를 null로 변환한다', async () => {
    await service.addAuditLogEvent({
      action: 'SYSTEM_START',
      target: 'application',
      message: '애플리케이션이 시작되었습니다.',
    });

    const [job] = await service.readAuditLogJobs('audit-worker-1');

    expect(job?.actorId).toBeNull();
  });

  it('DB 저장 후 ACK하여 Pending 작업을 제거한다', async () => {
    await service.addAuditLogEvent({
      action: 'POST_DELETE',
      target: 'post:10',
      message: '게시글을 삭제했습니다.',
      actorId: 3,
    });
    const [job] = await service.readAuditLogJobs('audit-worker-1');
    expect(job).toBeDefined();
    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 1 });

    // DB 저장 성공 후 XACK이 실행되어 PEL에서 작업이 제거되어야 합니다.
    const saved = await service.saveAuditLogToDatabase(job!);

    expect(saved).toMatchObject({
      action: 'POST_DELETE',
      target: 'post:10',
      message: '게시글을 삭제했습니다.',
    });
    await expect(prisma.auditLog.count()).resolves.toBe(1);
    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 0 });
  });

  it('최근 이벤트를 최신 메시지부터 반환한다', async () => {
    await service.addAuditLogEvent({ action: 'FIRST', target: 'one', message: '첫 번째' });
    await service.addAuditLogEvent({ action: 'SECOND', target: 'two', message: '두 번째' });

    const events = await service.getRecentAuditLogEvents(2);

    expect(events.map((event) => event.action)).toEqual(['SECOND', 'FIRST']);
  });

  it('필수 필드가 누락된 Stream 메시지를 거부한다', async () => {
    // 서비스 밖에서 기록된 손상 메시지를 만들어 런타임 파서의 방어 동작을 검증합니다.
    await redis.xAdd(RedisKey.stream.auditLogs(), '*', {
      target: 'user:1',
      message: 'action 누락',
      actorId: '',
      createdAt: new Date().toISOString(),
    });

    await expect(service.readAuditLogJobs('audit-worker-1')).rejects.toThrow('action 필드');
  });
});
