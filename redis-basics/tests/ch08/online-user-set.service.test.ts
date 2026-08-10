// tests/ch08/online-user-set.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { OnlineUserSetService } from '../../src/ch08/online-user-set.service.js';
import { prisma } from '../../src/shared/prisma.js';

/** 온라인 사용자 Set의 중복 제거, 상태 확인, 인원 집계를 검증합니다. */
describe('OnlineUserSetService', () => {
  const service = new OnlineUserSetService();
  let firstUserId: number;
  let secondUserId: number;

  // 온라인 등록 전 DB 사용자 존재 여부 검증을 통과하도록 사용자를 생성합니다.
  beforeEach(async () => {
    const first = await prisma.user.create({
      data: { email: 'online-first@example.com', name: '첫 번째 사용자' },
    });
    const second = await prisma.user.create({
      data: { email: 'online-second@example.com', name: '두 번째 사용자' },
    });

    firstUserId = first.id;
    secondUserId = second.id;
  });

  it('사용자를 온라인으로 등록하고 중복 등록은 한 번만 집계한다', async () => {
    const first = await service.markUserOnline(firstUserId);
    const duplicate = await service.markUserOnline(firstUserId);

    expect(first).toEqual({ userId: firstUserId, online: true, onlineUserCount: 1 });
    expect(duplicate).toEqual({ userId: firstUserId, online: true, onlineUserCount: 1 });
    await expect(service.isUserOnline(firstUserId)).resolves.toBe(true);
  });

  it('온라인 사용자 수와 사용자 ID 목록을 반환한다', async () => {
    await service.markUserOnline(firstUserId);
    await service.markUserOnline(secondUserId);

    const summary = await service.getOnlineUserSummary();
    expect(summary.onlineUserCount).toBe(2);
    expect(summary.onlineUserIds).toEqual(expect.arrayContaining([firstUserId, secondUserId]));
    await expect(service.getOnlineUserCount()).resolves.toBe(2);
  });

  it('사용자를 오프라인으로 변경하고 중복 변경을 안전하게 처리한다', async () => {
    await service.markUserOnline(firstUserId);

    const first = await service.markUserOffline(firstUserId);
    const duplicate = await service.markUserOffline(firstUserId);

    expect(first).toEqual({ userId: firstUserId, online: false, onlineUserCount: 0 });
    expect(duplicate).toEqual({ userId: firstUserId, online: false, onlineUserCount: 0 });
    await expect(service.isUserOnline(firstUserId)).resolves.toBe(false);
  });

  it('DB에 없는 사용자의 온라인 등록을 거부한다', async () => {
    await expect(service.markUserOnline(999_999)).rejects.toThrow();
    await expect(service.getOnlineUserCount()).resolves.toBe(0);
  });

  it('온라인 사용자 Set 전체를 초기화한다', async () => {
    await service.markUserOnline(firstUserId);
    await service.markUserOnline(secondUserId);

    await service.clearOnlineUsers();

    await expect(service.getOnlineUserSummary()).resolves.toEqual({
      onlineUserCount: 0,
      onlineUserIds: [],
    });
  });
});
