// tests/ch08/visitor-set.service.test.ts

import { describe, expect, it } from 'vitest';

import { VisitorSetService } from '../../src/ch08/visitor-set.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

/** 날짜별 방문자의 중복 제거와 EXPIRE NX 기반 TTL 동작을 검증합니다. */
describe('VisitorSetService', () => {
  const service = new VisitorSetService();
  const date = '2026-08-09';

  it('같은 사용자의 방문을 한 번만 기록한다', async () => {
    const first = await service.addDailyVisitor(date, 1);
    const duplicate = await service.addDailyVisitor(date, 1);

    expect(first).toMatchObject({ isNewVisitor: true, visitorCount: 1 });
    expect(duplicate).toMatchObject({ isNewVisitor: false, visitorCount: 1 });
    await expect(service.hasVisitedToday(date, 1)).resolves.toBe(true);
  });

  it('서로 다른 방문자를 집계하고 ID를 오름차순으로 반환한다', async () => {
    await service.addDailyVisitor(date, 3);
    await service.addDailyVisitor(date, 1);
    await service.addDailyVisitor(date, 2);

    await expect(service.getDailyVisitorSummary(date)).resolves.toEqual({
      date,
      visitorCount: 3,
      userIds: [1, 2, 3],
    });
    await expect(service.getDailyVisitorCount(date)).resolves.toBe(3);
  });

  it('새 방문자 Set에 이틀 TTL을 설정한다', async () => {
    await service.addDailyVisitor(date, 1);

    const ttl = await redis.ttl(RedisKey.set.dailyVisitors(date));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 24 * 2);
  });

  it('기존 TTL을 새 방문마다 연장하지 않는다', async () => {
    const key = RedisKey.set.dailyVisitors(date);
    await service.addDailyVisitor(date, 1);
    await redis.expire(key, 60);

    // EXPIRE NX는 이미 TTL이 있는 key를 변경하지 않아야 합니다.
    await service.addDailyVisitor(date, 2);

    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('TTL 없는 방문자 Set을 발견하면 만료 시간을 설정한다', async () => {
    const key = RedisKey.set.dailyVisitors(date);
    await redis.sAdd(key, '1');
    await expect(redis.ttl(key)).resolves.toBe(-1);

    // SADD와 EXPIRE NX가 같은 Transaction에 있어 영구 key를 정상 상태로 복구합니다.
    await service.addDailyVisitor(date, 2);

    await expect(redis.ttl(key)).resolves.toBeGreaterThan(0);
  });

  it('날짜별 방문자 Set을 삭제한다', async () => {
    await service.addDailyVisitor(date, 1);

    await service.deleteDailyVisitors(date);

    await expect(service.getDailyVisitorCount(date)).resolves.toBe(0);
    await expect(service.hasVisitedToday(date, 1)).resolves.toBe(false);
  });
});
