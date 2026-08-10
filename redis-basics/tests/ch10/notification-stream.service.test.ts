// tests/ch10/notification-stream.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { NotificationStreamService } from '../../src/ch10/notification-stream.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

/** 알림 Stream의 적재, Consumer Group 분배, Pending/ACK와 입력 검증을 확인합니다. */
describe('NotificationStreamService', () => {
  const service = new NotificationStreamService();

  beforeEach(async () => {
    // 그룹 생성 이전 메시지를 `$`가 건너뛰므로 테스트 이벤트보다 먼저 그룹을 준비합니다.
    await service.createConsumerGroup();
  });

  it('알림 이벤트를 타입이 보존된 worker 작업으로 읽는다', async () => {
    // Stream의 모든 값은 문자열이므로 userId가 다시 숫자로 변환되는지까지 검증합니다.
    const messageId = await service.addNotificationEvent({
      userId: 1,
      type: 'post.liked',
      title: '새 좋아요',
      message: '게시글에 좋아요가 추가되었습니다.',
    });

    const jobs = await service.readNotificationJobs('notification-worker-1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: messageId,
      userId: 1,
      type: 'post.liked',
      title: '새 좋아요',
    });
  });

  it('여러 consumer가 새 알림 작업을 나누어 받는다', async () => {
    await service.addNotificationEvent({
      userId: 1,
      type: 'order.created',
      title: '주문 생성',
      message: '주문이 생성되었습니다.',
    });
    await service.addNotificationEvent({
      userId: 2,
      type: 'admin.notice',
      title: '관리자 공지',
      message: '서비스 점검 안내입니다.',
    });

    // 첫 consumer가 COUNT 1로 하나만 가져가면 나머지 새 메시지는 다음 consumer에게 전달됩니다.
    const firstJobs = await service.readNotificationJobs('notification-worker-1', 1);
    const secondJobs = await service.readNotificationJobs('notification-worker-2', 1);

    expect(firstJobs).toHaveLength(1);
    expect(secondJobs).toHaveLength(1);
    expect(firstJobs[0]?.id).not.toBe(secondJobs[0]?.id);
    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 2 });
  });

  it('ACK한 작업을 Pending 목록에서 제거한다', async () => {
    await service.addNotificationEvent({
      userId: 3,
      type: 'comment.created',
      title: '새 댓글',
      message: '게시글에 댓글이 등록되었습니다.',
    });
    const [job] = await service.readNotificationJobs('notification-worker-1');
    expect(job).toBeDefined();

    // Consumer Group의 PEL에서 해당 메시지 ID만 제거합니다.
    await service.ackNotificationJob(job!.id);

    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 0 });
  });

  it('유효하지 않은 사용자 ID가 저장된 메시지를 거부한다', async () => {
    await redis.xAdd(RedisKey.stream.notifications(), '*', {
      userId: 'not-a-number',
      type: 'admin.notice',
      title: '잘못된 알림',
      message: '잘못된 사용자 ID',
      createdAt: new Date().toISOString(),
    });

    await expect(service.readNotificationJobs('notification-worker-1')).rejects.toThrow(
      'userId 필드',
    );
  });

  it('지원하지 않는 알림 종류가 저장된 메시지를 거부한다', async () => {
    await redis.xAdd(RedisKey.stream.notifications(), '*', {
      userId: '1',
      type: 'unknown.notice',
      title: '잘못된 알림',
      message: '지원하지 않는 종류',
      createdAt: new Date().toISOString(),
    });

    await expect(service.readNotificationJobs('notification-worker-1')).rejects.toThrow(
      'type 필드',
    );
  });
});
