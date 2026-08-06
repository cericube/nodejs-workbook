import { describe, expect, it } from 'vitest';

import {
  UserSettingHashService,
  type UserSettingOutput,
} from '../../src/ch06/user-setting-hash.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

describe('UserSettingHashService', () => {
  const service = new UserSettingHashService();

  it('저장된 설정이 없으면 기본 설정을 생성한다', async () => {
    const setting = await service.getUserSetting(1);

    expect(setting).toMatchObject({
      userId: 1,
      theme: 'light',
      language: 'ko',
      emailNotification: true,
      smsNotification: false,
      marketingAgreed: false,
    });
    expect(await redis.exists(RedisKey.hash.userSetting(1))).toBe(1);
  });

  it('boolean을 문자열로 저장하고 다시 boolean으로 변환한다', async () => {
    const setting: UserSettingOutput = {
      userId: 2,
      theme: 'dark',
      language: 'en',
      emailNotification: false,
      smsNotification: true,
      marketingAgreed: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await service.saveUserSettingToHash(setting);

    await expect(service.getUserSetting(2)).resolves.toEqual(setting);
    await expect(service.getSettingField(2, 'smsNotification')).resolves.toBe('true');
  });

  it('전달한 설정만 수정하고 나머지 필드는 유지한다', async () => {
    const original = await service.getUserSetting(3);
    const updated = await service.updateUserSetting(3, {
      theme: 'dark',
      smsNotification: true,
    });

    expect(updated).toMatchObject({
      theme: 'dark',
      language: original.language,
      emailNotification: original.emailNotification,
      smsNotification: true,
      marketingAgreed: original.marketingAgreed,
    });
    await expect(service.getSettingField(3, 'theme')).resolves.toBe('dark');
  });

  it('일부 필드만 남은 Hash를 기본값과 병합해 완전한 설정으로 복구한다', async () => {
    const key = RedisKey.hash.userSetting(5);
    await redis.hSet(key, { theme: 'dark' });

    const setting = await service.getUserSetting(5);

    expect(setting).toMatchObject({
      theme: 'dark',
      language: 'ko',
      emailNotification: true,
      smsNotification: false,
      marketingAgreed: false,
    });
    // userId는 Key에 포함되므로 Hash에는 나머지 6개 필드만 저장합니다.
    expect(await redis.hLen(key)).toBe(6);
  });

  it('설정을 삭제하면 다음 조회에서 기본값을 다시 생성한다', async () => {
    await service.updateUserSetting(4, { theme: 'dark', language: 'en' });
    await service.deleteUserSetting(4);

    expect(await redis.exists(RedisKey.hash.userSetting(4))).toBe(0);
    await expect(service.getUserSetting(4)).resolves.toMatchObject({
      theme: 'light',
      language: 'ko',
    });
  });
});
