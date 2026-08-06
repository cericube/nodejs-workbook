import { describe, expect, it } from 'vitest';

import { UserService } from '../../src/ch05/user.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

describe('UserService', () => {
  const service = new UserService();

  it('사용자를 생성하고 날짜를 ISO 문자열로 반환한다', async () => {
    const user = await service.createUser({
      email: 'user-create@example.com',
      name: '생성 사용자',
    });

    expect(user).toMatchObject({
      email: 'user-create@example.com',
      name: '생성 사용자',
      point: 0,
      status: 'ACTIVE',
    });
    expect(Date.parse(user.createdAt)).not.toBeNaN();
    expect(Date.parse(user.updatedAt)).not.toBeNaN();
    await expect(service.getUserById(user.id)).resolves.toEqual(user);
  });

  it('존재하지 않는 사용자 조회는 Prisma 예외를 전달한다', async () => {
    await expect(service.getUserById(-1)).rejects.toThrow();
  });

  it('Cache-Aside 방식으로 사용자 조회 결과를 재사용한다', async () => {
    const user = await service.createUser({
      email: 'user-cache@example.com',
      name: '캐시 이전 이름',
    });
    const cacheKey = RedisKey.cache.user(user.id);

    const cached = await service.getUserByIdWithCache(user.id);
    expect(await redis.exists(cacheKey)).toBe(1);

    // DB만 직접 변경해 캐시가 우선 반환되는지 확인합니다.
    await prisma.user.update({
      where: { id: user.id },
      data: { name: 'DB에서만 변경한 이름' },
    });

    await expect(service.getUserByIdWithCache(user.id)).resolves.toEqual(cached);
  });

  it('사용자 수정 후 기존 캐시를 무효화한다', async () => {
    const user = await service.createUser({
      email: 'user-update@example.com',
      name: '수정 전',
    });
    const cacheKey = RedisKey.cache.user(user.id);
    await service.getUserByIdWithCache(user.id);

    const updated = await service.updateUser(user.id, {
      name: '수정 후',
      status: 'INACTIVE',
    });

    expect(updated).toMatchObject({ name: '수정 후', status: 'INACTIVE' });
    expect(await redis.exists(cacheKey)).toBe(0);
    await expect(service.getUserByIdWithCache(user.id)).resolves.toMatchObject({
      name: '수정 후',
      status: 'INACTIVE',
    });
  });
});
