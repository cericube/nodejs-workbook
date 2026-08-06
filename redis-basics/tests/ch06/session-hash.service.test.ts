import { describe, expect, it } from 'vitest';

import { SessionHashService } from '../../src/ch06/session-hash.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

describe('SessionHashService', () => {
  const service = new SessionHashService();

  it('세션 Hash와 TTL을 생성한다', async () => {
    const session = await service.createSession(
      {
        sessionId: 'session-1',
        userId: 10,
        email: 'session@example.com',
        role: 'USER',
        userAgent: 'Vitest',
        ip: '127.0.0.1',
      },
      30,
    );

    expect(session).toMatchObject({
      sessionId: 'session-1',
      userId: 10,
      email: 'session@example.com',
      role: 'USER',
      userAgent: 'Vitest',
      ip: '127.0.0.1',
    });
    expect(Date.parse(session.expiresAt) - Date.parse(session.issuedAt)).toBe(30_000);
    await expect(service.getSession('session-1')).resolves.toEqual(session);
    await expect(service.getSessionUserId('session-1')).resolves.toBe(10);

    const ttl = await service.getSessionTtl('session-1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  it('선택 입력이 없으면 빈 문자열로 저장한다', async () => {
    const session = await service.createSession({
      sessionId: 'session-optional',
      userId: 11,
      email: 'optional@example.com',
      role: 'ADMIN',
    });

    expect(session).toMatchObject({ userAgent: '', ip: '' });
  });

  it('0 이하의 TTL은 세션 Hash를 만들기 전에 거부한다', async () => {
    await expect(
      service.createSession(
        {
          sessionId: 'invalid-ttl',
          userId: 99,
          email: 'invalid@example.com',
          role: 'USER',
        },
        0,
      ),
    ).rejects.toThrow('ttlSeconds must be a positive integer');

    expect(await redis.exists(RedisKey.hash.userSession('invalid-ttl'))).toBe(0);
  });

  it('마지막 접근 시간 필드만 갱신한다', async () => {
    const sessionId = 'session-touch';
    await service.createSession({
      sessionId,
      userId: 12,
      email: 'touch@example.com',
      role: 'USER',
    });
    const key = RedisKey.hash.userSession(sessionId);
    await redis.hSet(key, 'lastAccessedAt', '2000-01-01T00:00:00.000Z');

    await service.touchSession(sessionId);

    const touched = await service.getSession(sessionId);
    expect(touched?.lastAccessedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(touched?.email).toBe('touch@example.com');
  });

  it('세션을 삭제하면 조회 결과와 TTL이 없는 상태가 된다', async () => {
    await service.createSession({
      sessionId: 'session-delete',
      userId: 13,
      email: 'delete@example.com',
      role: 'USER',
    });

    await service.deleteSession('session-delete');

    await expect(service.getSession('session-delete')).resolves.toBeNull();
    await expect(service.getSessionUserId('session-delete')).resolves.toBeNull();
    await expect(service.getSessionTtl('session-delete')).resolves.toBe(-2);
  });

  it('존재하지 않는 세션을 touch해도 불완전한 Hash를 생성하지 않는다', async () => {
    await service.touchSession('missing-session');

    expect(await redis.exists(RedisKey.hash.userSession('missing-session'))).toBe(0);
  });

  it('필수 필드가 빠진 Hash는 정상 세션으로 반환하지 않는다', async () => {
    const key = RedisKey.hash.userSession('broken-session');
    await redis.hSet(key, { sessionId: 'broken-session', userId: 'invalid' });

    await expect(service.getSession('broken-session')).resolves.toBeNull();
    await expect(service.getSessionUserId('broken-session')).resolves.toBeNull();
  });
});
