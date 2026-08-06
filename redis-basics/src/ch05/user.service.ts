// src/ch05/user.service.ts

import { prisma } from '../shared/prisma';
import { CacheService } from '../ch04/cache.service';
import { RedisKey } from '../shared/redis-key';
import type { Prisma } from '../generated/prisma/client';

// 사용자 생성 시 입력으로 받을 수 있는 필드들입니다.
export type CreateUserInput = {
  /** 중복될 수 없는 사용자 이메일입니다. */
  email: string;
  /** 화면에 표시할 사용자 이름입니다. */
  name: string;
};

// 사용자 정보 수정 시 입력으로 받을 수 있는 필드들입니다.
export type UpdateUserInput = {
  /** 변경할 사용자 이름이며 생략하면 기존 값을 유지합니다. */
  name?: string;
  /** 변경할 사용자 상태이며 생략하면 기존 값을 유지합니다. */
  status?: string;
};

/**
 * 사용자 조회 시 공통으로 사용할 Prisma select 옵션
 *
 * 1. DB 컬럼 중 API 응답에 필요한 필드만 가져옵니다.
 * 2. create/find/update 메서드에서 같은 select를 재사용합니다.
 * 3. 응답 필드가 메서드마다 달라지는 실수를 줄입니다.
 */
const UserSelect: Prisma.UserSelect = {
  id: true,
  email: true,
  name: true,
  point: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

export type UserOutput = {
  /** 사용자 PK입니다. */
  id: number;
  /** 사용자 이메일입니다. */
  email: string;
  /** 사용자 이름입니다. */
  name: string;
  /** 포인트 랭킹 등에 사용하는 현재 포인트입니다. */
  point: number;
  /** ACTIVE 등의 사용자 상태입니다. */
  status: string;
  /** ISO 8601 형식의 생성 일시입니다. */
  createdAt: string;
  /** ISO 8601 형식의 최근 수정 일시입니다. */
  updatedAt: string;
};

/**
 * Prisma User 조회 결과를 API 응답 형태로 변환
 *
 * Prisma는 createdAt/updatedAt을 Date 객체로 반환합니다.
 * JSON 응답에서는 문자열이 다루기 쉬우므로 ISO 문자열로 변환합니다.
 *
 * 이 함수를 거치면 생성/조회/수정 API가 모두 같은 UserOutput 형태를 반환합니다.
 */
function toUserOutput(user: {
  id: number;
  email: string;
  name: string;
  point: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): UserOutput {
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
 * SQLite의 사용자 원본 데이터와 Redis의 사용자 조회 캐시를 함께 관리합니다.
 * Cache-Aside 전략을 사용하며 DB 수정 후 관련 캐시를 무효화합니다.
 */
export class UserService {
  // 서비스 인스턴스별로 캐시 접근 로직을 재사용합니다.
  private cacheService = new CacheService();

  /**
   * 사용자 생성
   *
   * 1. 전달받은 email/name으로 DB에 사용자를 생성합니다.
   * 2. UserSelect로 필요한 필드만 다시 가져옵니다.
   * 3. Prisma 결과를 UserOutput 형태로 변환해 반환합니다.
   *
   * 실습 포인트:
   * DB 저장 결과를 그대로 반환하지 않고, 서비스 밖으로 나가는 응답 형태를 통일합니다.
   */
  async createUser(input: CreateUserInput) {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
      },
      select: UserSelect,
    });
    return toUserOutput(user);
  }

  /**
   * DB에서 사용자 단건 조회
   *
   * 1. userId로 User 테이블에서 사용자 1명을 조회합니다.
   * 2. 조회 결과를 UserOutput 형태로 변환합니다.
   *
   * findUniqueOrThrow는 사용자가 없으면 null을 반환하지 않고 Prisma 예외(P2025)를 던집니다.
   * 라우터나 컨트롤러에서 이 예외를 404 응답으로 바꾸는 흐름을 실습할 수 있습니다.
   */
  async getUserById(userId: number): Promise<UserOutput> {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },

      select: UserSelect,
    });

    return toUserOutput(user);
  }

  /**
   * Redis 캐시를 사용하는 사용자 단건 조회
   *
   * 1. userId로 Redis cache key를 만듭니다.
   * 2. Redis에서 사용자 JSON 데이터를 먼저 조회합니다.
   * 3. 캐시에 값이 있으면 DB를 조회하지 않고 바로 반환합니다.
   * 4. 캐시에 값이 없으면 DB에서 조회합니다.
   * 5. DB 조회 결과를 Redis에 60초 동안 저장합니다.
   *
   * 실습 포인트:
   * 자주 조회되는 데이터를 Redis에 잠시 저장하면 DB 조회 횟수를 줄일 수 있습니다.
   */
  async getUserByIdWithCache(userId: number): Promise<UserOutput> {
    // 사용자별 캐시 key입니다.
    // 예: cache:user:1
    const cacheKey = RedisKey.cache.user(userId);

    // Cache hit: Redis에 데이터가 있으면 DB를 조회하지 않고 바로 반환합니다.
    const cachedUser = await this.cacheService.getJson<UserOutput>(cacheKey);

    if (cachedUser) {
      return cachedUser;
    }

    // Cache miss: Redis에 없을 때만 DB를 조회합니다.
    const user = await this.getUserById(userId);

    // TTL 60초로 저장합니다.
    // 60초가 지나면 Redis가 key를 자동 삭제하므로 오래된 데이터가 무기한 남지 않습니다.
    await this.cacheService.setJson(cacheKey, user, 60);

    return user;
  }

  /**
   * 사용자 정보 수정
   *
   * 1. userId에 해당하는 사용자의 name/status를 수정합니다.
   * 2. undefined가 아닌 필드만 update data에 포함합니다.
   * 3. DB 수정이 끝나면 기존 Redis 캐시를 삭제합니다.
   * 4. 수정된 사용자 정보를 UserOutput 형태로 변환해 반환합니다.
   *
   * 실습 포인트:
   * DB 데이터가 바뀌면 Redis에 남아 있는 예전 캐시를 지워야 합니다.
   * 그래야 다음 getUserByIdWithCache 호출에서 DB의 최신 값을 다시 읽고 캐싱합니다.
   */
  async updateUser(userId: number, input: UpdateUserInput) {
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
      select: UserSelect,
    });

    // DB 업데이트 후 캐시 무효화
    // 기존 캐시를 지워야 다음 getUserByIdWithCache 호출에서 최신 값을 다시 캐싱합니다.
    const cacheKey = RedisKey.cache.user(userId);
    await this.cacheService.deleteCache(cacheKey);

    return toUserOutput(user);
  }
}
