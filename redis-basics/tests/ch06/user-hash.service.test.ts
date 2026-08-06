import { beforeEach, describe, expect, it } from 'vitest';

import { UserHashService } from '../../src/ch06/user-hash.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

describe('UserHashService', () => {
  const service = new UserHashService();
  let userId: number;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: 'user-hash@example.com',
        name: 'Hash 사용자',
      },
    });
    userId = user.id;
  });

  it('Hash가 없으면 null을 반환하고 DB 조회 후 캐시를 생성한다', async () => {
    await expect(service.getUserProfileFromHash(userId)).resolves.toBeNull();

    const profile = await service.getUserProfile(userId);
    expect(profile).toMatchObject({ id: userId, name: 'Hash 사용자', point: 0 });
    await expect(service.getUserProfileFromHash(userId)).resolves.toEqual(profile);

    const ttl = await redis.ttl(RedisKey.hash.userProfile(userId));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('캐시가 있으면 DB에서 변경된 값보다 Hash를 우선 반환한다', async () => {
    const cached = await service.getUserProfile(userId);
    await prisma.user.update({
      where: { id: userId },
      data: { name: 'DB에서만 변경' },
    });

    await expect(service.getUserProfile(userId)).resolves.toEqual(cached);
  });

  it('불완전한 사용자 Hash는 캐시 미스로 처리하고 DB 값으로 복구한다', async () => {
    const key = RedisKey.hash.userProfile(userId);
    await redis.hSet(key, { id: String(userId), point: 'invalid' });

    await expect(service.getUserProfileFromHash(userId)).resolves.toBeNull();

    const recovered = await service.getUserProfile(userId);
    expect(recovered).toMatchObject({ id: userId, name: 'Hash 사용자', point: 0 });
    await expect(service.getUserProfileFromHash(userId)).resolves.toEqual(recovered);
  });

  it('프로필 수정과 포인트 증가 결과를 DB와 Hash에 동기화한다', async () => {
    const updated = await service.updateUserProfile(userId, {
      name: '수정된 사용자',
      status: 'INACTIVE',
    });
    expect(updated).toMatchObject({ name: '수정된 사용자', status: 'INACTIVE' });

    const increased = await service.increaseUserPoint(userId, 15);
    expect(increased.point).toBe(15);
    await expect(service.getUserProfileFromDatabase(userId)).resolves.toEqual(increased);
    await expect(service.getUserProfileFromHash(userId)).resolves.toEqual(increased);
  });

  it('Hash를 삭제하고 DB 기준으로 다시 동기화한다', async () => {
    await service.getUserProfile(userId);
    await service.deleteUserProfileHash(userId);
    await expect(service.getUserProfileFromHash(userId)).resolves.toBeNull();

    await prisma.user.update({
      where: { id: userId },
      data: { name: 'DB 최신 이름' },
    });
    await redis.hSet(RedisKey.hash.userProfile(userId), { name: '오래된 캐시' });

    const synced = await service.syncUserProfileFromDatabase(userId);
    expect(synced.name).toBe('DB 최신 이름');
    await expect(service.getUserProfileFromHash(userId)).resolves.toEqual(synced);
  });
});
