// src/ch06/session-hash.service.ts

import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

// 세션이 존재할 때만 마지막 접근 시간을 수정합니다.
// EXISTS와 HSET을 한 Script로 묶어 검사 직후 세션이 삭제되는 경쟁 조건도 방지합니다.
const TOUCH_SESSION_SCRIPT = `
  if redis.call('EXISTS', KEYS[1]) == 0 then
    return 0
  end

  redis.call('HSET', KEYS[1], 'lastAccessedAt', ARGV[1])
  return 1
`;

// 세션 생성 시 입력으로 받을 수 있는 필드들입니다.
export type CreateSessionInput = {
  sessionId: string;
  userId: number;
  email: string;
  role: string;
  userAgent?: string;
  ip?: string;
};

// Redis Hash에 저장하고 서비스 밖으로 반환할 로그인 세션 형태입니다.
export type SessionOutput = {
  sessionId: string;
  userId: number;
  email: string;
  role: string;
  issuedAt: string;
  expiresAt: string;
  lastAccessedAt: string;
  userAgent: string;
  ip: string;
};

/**
 * Redis Hash 조회 결과를 SessionOutput 형태로 변환
 *
 * hGetAll은 Hash가 없을 때 빈 객체를 반환합니다.
 * 빈 객체는 세션이 없거나 만료된 상태로 판단할 수 있도록 null로 변환합니다.
 *
 * Redis Hash의 값은 문자열로 저장되므로 userId는 숫자로 다시 변환합니다.
 */
function parseSessionHash(hash: Record<string, string>): SessionOutput | null {
  if (Object.keys(hash).length === 0) {
    return null;
  }

  const userId = Number(hash.userId);
  const { sessionId, email, role, issuedAt, expiresAt, lastAccessedAt } = hash;

  // 필수 필드가 빠진 Hash는 정상 로그인 세션으로 사용할 수 없으므로
  // undefined가 섞인 객체 대신 캐시 미스를 의미하는 null을 반환합니다.
  if (
    !Number.isInteger(userId) ||
    sessionId === undefined ||
    email === undefined ||
    role === undefined ||
    issuedAt === undefined ||
    expiresAt === undefined ||
    lastAccessedAt === undefined
  ) {
    return null;
  }

  return {
    sessionId,
    userId,
    email,
    role,
    issuedAt,
    expiresAt,
    lastAccessedAt,
    // 이전 버전의 세션 Hash에 선택 필드가 없을 수 있으므로 빈 문자열로 보완합니다.
    userAgent: hash.userAgent ?? '',
    ip: hash.ip ?? '',
  };
}

export class SessionHashService {
  /**
   * 로그인 세션 생성
   *
   * 1. sessionId로 Redis Hash key를 만듭니다.
   * 2. 현재 시간을 기준으로 발급 시간과 만료 시간을 계산합니다.
   * 3. 세션 정보를 Redis Hash 필드로 저장합니다.
   * 4. TTL을 설정해 만료 시간이 지나면 세션이 자동 삭제되게 합니다.
   *
   * 실습 포인트:
   * Redis Hash는 세션 정보를 필드별로 저장할 수 있어 userId 같은 특정 값만 따로 조회하기 쉽습니다.
   */
  async createSession(input: CreateSessionInput, ttlSeconds = 60 * 60): Promise<SessionOutput> {
    // 0 이하의 TTL은 세션을 생성하자마자 삭제하므로 저장 전에 차단합니다.
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('ttlSeconds must be a positive integer');
    }

    // 로그인 세션 Hash key입니다.
    // 예: hash:session:abc123
    const key = RedisKey.hash.userSession(input.sessionId);

    // issuedAt/expiresAt은 서버 시간을 기준으로 계산합니다.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const session: SessionOutput = {
      sessionId: input.sessionId,
      userId: input.userId,
      email: input.email,
      role: input.role,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastAccessedAt: now.toISOString(),
      userAgent: input.userAgent ?? '',
      ip: input.ip ?? '',
    };

    // HSET과 EXPIRE는 별도 명령이므로 원자적이지 않습니다.
    // 두 명령 사이에 오류가 발생하면 TTL 없는 세션이 남을 수 있습니다.

    // 사용자 세션의 필드 값을 저장하거나 갱신합니다.
    // 여러 필드를 함께 저장하고 새로 추가된 필드 수를 반환하며, 기존 필드는 값을 덮어씁니다.

    // await redis.hSet(key, {
    //   sessionId: session.sessionId,
    //   userId: String(session.userId),
    //   email: session.email,
    //   role: session.role,
    //   issuedAt: session.issuedAt,
    //   expiresAt: session.expiresAt,
    //   lastAccessedAt: session.lastAccessedAt,
    //   userAgent: session.userAgent,
    //   ip: session.ip,
    // });

    // // 사용자 세션이 일정 시간이 지나면 자동으로 정리되도록 설정합니다.
    // // 만료 시간을 설정하면 1을, 사용자 세션가 없으면 0을 반환합니다.
    // await redis.expire(key, ttlSeconds);

    // HSET과 EXPIRE를 Redis Transaction으로 묶어 원자적으로 실행합니다.
    // 세션 Hash 저장과 TTL 설정이 하나의 작업으로 처리되어 TTL 없는 세션이 남지 않습니다.
    await redis
      .multi()
      .hSet(key, {
        sessionId: session.sessionId,
        userId: String(session.userId),
        email: session.email,
        role: session.role,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        lastAccessedAt: session.lastAccessedAt,
        userAgent: session.userAgent,
        ip: session.ip,
      })
      .expire(key, ttlSeconds)
      .exec();

    return session;
  }

  /**
   * 세션 전체 조회
   *
   * 1. sessionId로 Redis Hash key를 만듭니다.
   * 2. hGetAll로 세션 Hash 전체 필드를 조회합니다.
   * 3. Redis 조회 결과를 SessionOutput 형태로 변환합니다.
   */
  async getSession(sessionId: string): Promise<SessionOutput | null> {
    const key = RedisKey.hash.userSession(sessionId);
    // 사용자 세션의 모든 필드를 조회합니다.
    // 전체 필드와 값을 반환하며, 저장된 데이터가 없으면 빈 객체를 반환합니다.
    const hash = await redis.hGetAll(key);

    return parseSessionHash(hash);
  }

  /**
   * 세션의 사용자 ID만 조회
   *
   * 1. sessionId로 Redis Hash key를 만듭니다.
   * 2. hGet으로 userId 필드만 조회합니다.
   * 3. 값이 있으면 숫자로 변환하고, 없으면 null을 반환합니다.
   *
   * 실습 포인트:
   * Redis Hash는 전체 객체를 읽지 않고 특정 field만 조회할 수 있습니다.
   */
  async getSessionUserId(sessionId: string): Promise<number | null> {
    const key = RedisKey.hash.userSession(sessionId);
    // 사용자 세션에서 필요한 필드 하나를 조회합니다.
    // 필드 값을 반환하며, 해당 필드나 데이터가 없으면 null을 반환합니다.
    const userId = await redis.hGet(key, 'userId');

    if (userId === null) {
      return null;
    }

    const parsedUserId = Number(userId);

    // 손상된 숫자 문자열을 NaN으로 노출하지 않고 유효하지 않은 세션으로 처리합니다.
    return Number.isInteger(parsedUserId) ? parsedUserId : null;
  }

  /**
   * 마지막 접근 시간 갱신
   *
   * 1. sessionId로 Redis Hash key를 만듭니다.
   * 2. 현재 시간을 ISO 문자열로 만듭니다.
   * 3. lastAccessedAt 필드만 갱신합니다.
   *
   * 실습 포인트:
   * 세션 전체를 다시 저장하지 않고 필요한 field만 수정할 수 있습니다.
   */
  async touchSession(sessionId: string): Promise<void> {
    const key = RedisKey.hash.userSession(sessionId);

    // 일반 HSET은 Key가 없으면 새 Hash를 만들기 때문에 Lua Script에서
    // 존재 여부 확인과 필드 수정을 원자적으로 처리합니다.
    await redis.eval(TOUCH_SESSION_SCRIPT, {
      keys: [key],
      arguments: [new Date().toISOString()],
    });
  }

  /**
   * 세션 TTL 조회
   *
   * 1. sessionId로 Redis Hash key를 만듭니다.
   * 2. Redis에 남아 있는 TTL을 초 단위로 조회합니다.
   *
   * 실습 포인트:
   * ttl 결과가 -2이면 key가 없고, -1이면 key는 있지만 만료 시간이 설정되지 않은 상태입니다.
   */
  async getSessionTtl(sessionId: string): Promise<number> {
    const key = RedisKey.hash.userSession(sessionId);
    // 사용자 세션의 남은 유효 시간을 조회합니다.
    // TTL을 초 단위로 반환하며, 만료 설정이 없으면 -1을, 데이터가 없으면 -2를 반환합니다.
    return redis.ttl(key);
  }

  /**
   * 세션 삭제
   *
   * 1. sessionId로 Redis Hash key를 만듭니다.
   * 2. 해당 세션 key를 Redis에서 삭제합니다.
   *
   * 실습 포인트:
   * 로그아웃이나 강제 만료 처리에서는 TTL을 기다리지 않고 세션을 바로 삭제합니다.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = RedisKey.hash.userSession(sessionId);
    // 사용자 세션 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
