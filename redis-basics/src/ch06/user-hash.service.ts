// src/ch06/user-hash.service.ts

import { prisma } from '../shared/prisma.js';
import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import type { Prisma } from '../generated/prisma/client';

/**
 * 사용자 프로필 조회 시 공통으로 사용할 Prisma select 옵션
 *
 * 1. Redis Hash에 저장할 사용자 프로필 필드만 가져옵니다.
 * 2. DB 조회/수정/포인트 증가 메서드에서 같은 select를 재사용합니다.
 * 3. Redis에 저장하는 필드와 API에서 다루는 필드가 어긋나는 실수를 줄입니다.
 */
const UserProfileSelect: Prisma.UserSelect = {
  id: true,
  email: true,
  name: true,
  point: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

// Redis Hash에 저장하고 서비스 밖으로 반환할 사용자 프로필 형태입니다.
export type UserProfileOutput = {
  id: number;
  email: string;
  name: string;
  point: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

// 사용자 프로필 수정 시 입력으로 받을 수 있는 필드들입니다.
export type UpdateUserProfileInput = {
  name?: string;
  status?: string;
};

/**
 * Prisma User 조회 결과를 Redis Hash에 저장하기 쉬운 형태로 변환
 *
 * Prisma는 createdAt/updatedAt을 Date 객체로 반환합니다.
 * Redis Hash에는 문자열 값을 저장하는 것이 다루기 쉬우므로 ISO 문자열로 변환합니다.
 *
 * 이 함수를 거치면 DB 조회/수정/포인트 증가 결과가 모두 같은 UserProfileOutput 형태가 됩니다.
 */
function toUserProfileOutput(user: {
  id: number;
  email: string;
  name: string;
  point: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): UserProfileOutput {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    point: user.point,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Redis Hash 조회 결과를 UserProfileOutput 형태로 변환
 *
 * hGetAll은 Hash가 없을 때 빈 객체를 반환합니다.
 * 빈 객체는 캐시 미스로 판단할 수 있도록 null로 변환합니다.
 *
 * Redis Hash의 값은 문자열로 저장되므로 id/point는 숫자로 다시 변환합니다.
 */
function parseUserProfileHash(hash: Record<string, string>): UserProfileOutput | null {
  if (Object.keys(hash).length === 0) {
    return null;
  }

  const id = Number(hash.id);
  const point = Number(hash.point);
  const { email, name, status, createdAt, updatedAt } = hash;

  // 불완전하거나 숫자 필드가 손상된 Hash는 캐시 미스로 처리합니다.
  // non-null assertion으로 오류를 숨기지 않고 DB 원본으로 복구할 기회를 제공합니다.
  if (
    !Number.isInteger(id) ||
    !Number.isInteger(point) ||
    email === undefined ||
    name === undefined ||
    status === undefined ||
    createdAt === undefined ||
    updatedAt === undefined
  ) {
    return null;
  }

  return {
    id,
    email,
    name,
    point,
    status,
    createdAt,
    updatedAt,
  };
}

export class UserHashService {
  /**
   * DB에서 사용자 프로필 단건 조회
   *
   * 1. userId로 User 테이블에서 사용자 1명을 조회합니다.
   * 2. UserProfileSelect로 Redis Hash에 필요한 필드만 가져옵니다.
   * 3. Prisma 결과를 UserProfileOutput 형태로 변환합니다.
   *
   * findUniqueOrThrow는 사용자가 없으면 null을 반환하지 않고 Prisma 예외(P2025)를 던집니다.
   */
  async getUserProfileFromDatabase(userId: number): Promise<UserProfileOutput> {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: UserProfileSelect,
    });

    return toUserProfileOutput(user);
  }

  /**
   * 사용자 프로필을 Redis Hash에 저장
   *
   * 1. userId로 Redis Hash key를 만듭니다.
   * 2. UserProfileOutput 필드를 Redis Hash 필드로 저장합니다.
   * 3. TTL을 설정해 오래된 캐시가 무기한 남지 않게 합니다.
   *
   * 실습 포인트:
   * Redis Hash는 객체 전체를 JSON 문자열로 저장하지 않고, 필드별로 나누어 저장할 수 있습니다.
   */
  async saveUserProfileToHash(user: UserProfileOutput, ttlSeconds = 300): Promise<void> {
    // 0 이하의 TTL은 캐시를 즉시 삭제하므로 저장 전에 차단합니다.
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('ttlSeconds must be a positive integer');
    }

    // 사용자 프로필 Hash key입니다.
    // 예: hash:user-profile:1
    const key = RedisKey.hash.userProfile(user.id);

    // HSET과 EXPIRE를 Transaction으로 묶어 다른 명령이 두 명령 사이에 끼어들지 못하게 합니다.
    // 따라서 Hash만 저장되고 TTL은 빠져 무기한 남는 불완전한 캐시 상태를 방지합니다.
    await redis
      .multi()
      .hSet(key, {
        id: String(user.id),
        email: user.email,
        name: user.name,
        point: String(user.point),
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .expire(key, ttlSeconds)
      .exec();
  }

  /**
   * Redis Hash에서 사용자 프로필 조회
   *
   * 1. userId로 Redis Hash key를 만듭니다.
   * 2. hGetAll로 Hash 전체 필드를 조회합니다.
   * 3. Redis 조회 결과를 UserProfileOutput 형태로 변환합니다.
   */
  async getUserProfileFromHash(userId: number): Promise<UserProfileOutput | null> {
    const key = RedisKey.hash.userProfile(userId);
    // 사용자 프로필 캐시의 모든 필드를 조회합니다.
    // 전체 필드와 값을 반환하며, 저장된 데이터가 없으면 빈 객체를 반환합니다.
    const hash = await redis.hGetAll(key);

    return parseUserProfileHash(hash);
  }

  /**
   * 사용자 프로필 조회
   *
   * 1. Redis Hash 조회
   * 2. 캐시가 있으면 Redis 데이터 반환
   * 3. 캐시가 없으면 DB 조회
   * 4. DB 조회 결과를 Redis Hash에 저장
   *
   * 실습 포인트:
   * JSON 캐시와 달리 Redis Hash는 필요한 필드만 따로 읽거나 갱신하는 흐름을 만들 수 있습니다.
   */
  async getUserProfile(userId: number): Promise<UserProfileOutput> {
    // Cache hit: Redis Hash에 데이터가 있으면 DB를 조회하지 않고 바로 반환합니다.
    const cachedProfile = await this.getUserProfileFromHash(userId);

    if (cachedProfile) {
      return cachedProfile;
    }

    // Cache miss: Redis Hash에 없을 때만 DB를 조회합니다.
    const dbProfile = await this.getUserProfileFromDatabase(userId);

    // DB 조회 결과를 다음 요청에서 재사용할 수 있도록 Hash에 저장합니다.
    await this.saveUserProfileToHash(dbProfile);

    return dbProfile;
  }

  /**
   * 사용자 프로필 수정
   *
   * 1. userId에 해당하는 사용자의 name/status를 수정합니다.
   * 2. undefined가 아닌 필드만 update data에 포함합니다.
   * 3. 수정된 사용자 정보를 UserProfileOutput 형태로 변환합니다.
   * 4. Redis Hash를 최신 데이터로 다시 저장합니다.
   *
   * 실습 포인트:
   * DB를 먼저 수정한 뒤 Redis Hash를 최신 데이터로 다시 저장합니다.
   * 이 방식은 write-through에 가까운 흐름입니다.
   *
   * 실무에서는 DB 갱신 후 Redis Hash를 삭제하는 방식도 자주 사용합니다.
   * 캐시를 직접 갱신하는 것보다 단순하고, 다음 조회 때 DB 기준 최신 값을 다시 캐싱하므로 더 안전합니다.
   */
  async updateUserProfile(
    userId: number,
    input: UpdateUserProfileInput,
  ): Promise<UserProfileOutput> {
    // prisma.user.update()는 대상 사용자가 없으면 null을 반환하지 않고
    // P2025 예외를 던집니다.
    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        // 값이 undefined인 필드는 업데이트하지 않습니다.
        // 예: name만 들어오면 status는 기존 값을 유지합니다.
        ...(input.name !== undefined && { name: input.name }),
        ...(input.status !== undefined && { status: input.status }),
      },
      select: UserProfileSelect,
    });

    const output = toUserProfileOutput(user);

    // DB 업데이트 후 Redis Hash도 같은 값으로 갱신합니다.
    await this.saveUserProfileToHash(output);

    return output;
  }

  /**
   * 사용자 포인트 증가
   *
   * 1. DB의 point를 전달받은 값만큼 증가시킵니다.
   * 2. 증가된 사용자 정보를 UserProfileOutput 형태로 변환합니다.
   * 3. Redis Hash를 최신 데이터로 다시 저장합니다.
   *
   * 실습 포인트:
   * 숫자 증감은 DB에서 원자적으로 처리하고, Redis Hash는 DB 결과를 기준으로 동기화합니다.
   *
   * 실무에서는 포인트처럼 정확성이 중요한 값일수록 DB를 원본 데이터로 두는 것이 안전합니다.
   * 캐시 갱신 로직이 복잡해지면 DB 갱신 후 Redis Hash를 삭제하고, 다음 조회에서 다시 캐싱하는 방식도 좋습니다.
   */
  async increaseUserPoint(userId: number, point: number): Promise<UserProfileOutput> {
    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        point: {
          increment: point,
        },
      },
      select: UserProfileSelect,
    });

    const output = toUserProfileOutput(user);

    // DB의 최신 point 값을 기준으로 Redis Hash를 갱신합니다.
    await this.saveUserProfileToHash(output);

    return output;
  }

  /**
   * 사용자 프로필 Hash 캐시 삭제
   *
   * 1. userId로 Redis Hash key를 만듭니다.
   * 2. 해당 Hash key를 Redis에서 삭제합니다.
   *
   * 실습 포인트:
   * 캐시를 지우면 다음 조회 시 DB에서 최신 데이터를 읽고 다시 캐싱합니다.
   */
  async deleteUserProfileHash(userId: number): Promise<void> {
    const key = RedisKey.hash.userProfile(userId);
    // 사용자 프로필 캐시 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }

  /**
   * DB 기준으로 Redis Hash 강제 동기화
   *
   * 1. DB에서 사용자 프로필을 다시 조회합니다.
   * 2. 조회한 값을 Redis Hash에 덮어씁니다.
   * 3. DB 기준 최신 사용자 프로필을 반환합니다.
   *
   * 실습 포인트:
   * Redis Hash 값이 오래되었거나 의심될 때 DB를 기준으로 캐시를 다시 맞출 수 있습니다.
   */
  async syncUserProfileFromDatabase(userId: number): Promise<UserProfileOutput> {
    const dbProfile = await this.getUserProfileFromDatabase(userId);

    // DB 값을 기준으로 Redis Hash를 다시 저장합니다.
    await this.saveUserProfileToHash(dbProfile);

    return dbProfile;
  }
}
