// src/ch06/user-setting-hash.service.ts

import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

// 사용자 설정 조회, 저장, 수정 결과로 사용하는 출력 형태입니다.
export type UserSettingOutput = {
  userId: number;
  theme: string;
  language: string;
  emailNotification: boolean;
  smsNotification: boolean;
  marketingAgreed: boolean;
  updatedAt: string;
};

// 사용자 설정 수정 시 입력으로 받을 수 있는 필드들입니다.
export type UpdateUserSettingInput = {
  theme?: string;
  language?: string;
  emailNotification?: boolean;
  smsNotification?: boolean;
  marketingAgreed?: boolean;
};

// userId는 Redis Key에 포함되므로 Hash에는 아래 6개 필드가 모두 있어야 합니다.
const USER_SETTING_HASH_FIELDS = [
  'theme',
  'language',
  'emailNotification',
  'smsNotification',
  'marketingAgreed',
  'updatedAt',
] as const;

/**
 * 신규 사용자에게 적용할 기본 설정을 만듭니다.
 *
 * 1. userId를 기준으로 사용자 설정 응답 형태를 만듭니다.
 * 2. 화면 테마, 언어, 알림 동의 여부에 기본값을 채웁니다.
 * 3. updatedAt은 현재 시간을 ISO 문자열로 저장합니다.
 *
 * 실습 포인트:
 * 저장된 설정이 없는 사용자는 기본 설정을 먼저 만들어두면 이후 조회와 수정에서 같은 형태를 유지할 수 있습니다.
 */
function defaultUserSetting(userId: number): UserSettingOutput {
  return {
    userId,
    theme: 'light',
    language: 'ko',
    emailNotification: true,
    smsNotification: false,
    marketingAgreed: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 저장된 boolean 문자열을 boolean 값으로 변환합니다.
 *
 * 저장소에서 가져온 값은 문자열이므로 `true` 문자열만 true로 판단합니다.
 */
function parseBoolean(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * 저장된 boolean 문자열을 기본값과 함께 변환합니다.
 *
 * 1. 저장된 값이 없으면 전달받은 기본값을 반환합니다.
 * 2. 저장된 값이 있으면 문자열 값을 boolean으로 변환합니다.
 *
 * 실습 포인트:
 * 일부 설정만 저장된 데이터를 읽더라도 누락된 boolean 설정이 잘못된 false로 바뀌지 않게 합니다.
 */
function parseBooleanWithDefault(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return parseBoolean(value);
}

/**
 * Redis에서 조회한 사용자 설정을 UserSettingOutput 형태로 변환합니다.
 *
 * 1. 조회 결과가 빈 객체이면 사용자 설정이 없는 상태로 보고 null을 반환합니다.
 * 2. 기본 설정을 만든 뒤 저장된 값을 우선 적용합니다.
 * 3. 저장된 값이 없는 항목은 기본 설정값으로 보완합니다.
 *
 * 실습 포인트:
 * Redis Hash는 field 단위로 수정할 수 있으므로 일부 항목만 있는 상태도 발생할 수 있습니다.
 * 반환값은 항상 완성된 사용자 설정 형태가 되도록 기본값과 병합합니다.
 */
function parseUserSettingHash(
  userId: number,
  hash: Record<string, string>,
): UserSettingOutput | null {
  if (Object.keys(hash).length === 0) {
    return null;
  }

  const defaultSetting = defaultUserSetting(userId);

  return {
    userId,
    theme: hash.theme ?? defaultSetting.theme,
    language: hash.language ?? defaultSetting.language,
    emailNotification: parseBooleanWithDefault(
      hash.emailNotification,
      defaultSetting.emailNotification,
    ),
    smsNotification: parseBooleanWithDefault(hash.smsNotification, defaultSetting.smsNotification),
    marketingAgreed: parseBooleanWithDefault(hash.marketingAgreed, defaultSetting.marketingAgreed),
    updatedAt: hash.updatedAt ?? defaultSetting.updatedAt,
  };
}

export class UserSettingHashService {
  /**
   * 사용자 설정 전체를 Redis Hash에 저장합니다.
   *
   * 1. userId로 사용자 설정 key를 만듭니다.
   * 2. UserSettingOutput의 각 항목을 저장합니다.
   * 3. boolean 값은 저장하기 전에 문자열로 변환합니다.
   *
   * 실습 포인트:
   * Redis Hash는 사용자 설정처럼 관련 있는 여러 값을 하나의 key 아래 field별로 저장할 수 있습니다.
   */
  async saveUserSettingToHash(setting: UserSettingOutput): Promise<void> {
    const key = RedisKey.hash.userSetting(setting.userId);

    // 사용자 설정 캐시의 필드 값을 저장하거나 갱신합니다.
    // 여러 필드를 함께 저장하고 새로 추가된 필드 수를 반환하며, 기존 필드는 값을 덮어씁니다.
    await redis.hSet(key, {
      theme: setting.theme,
      language: setting.language,
      emailNotification: String(setting.emailNotification),
      smsNotification: String(setting.smsNotification),
      marketingAgreed: String(setting.marketingAgreed),
      updatedAt: setting.updatedAt,
    });
  }

  /**
   * 사용자 설정을 조회합니다.
   *
   * 1. userId로 사용자 설정 key를 만듭니다.
   * 2. hGetAll로 사용자 설정 전체를 조회합니다.
   * 3. Hash가 있으면 기본값과 병합한 사용자 설정을 반환합니다.
   * 4. Hash가 없으면 기본 설정 전체를 생성해 Redis Hash에 저장한 뒤 반환합니다.
   *
   * 실습 포인트:
   * Redis Hash가 없을 때 기본 설정을 한 번 저장해두면 이후 조회와 부분 수정에서 같은 key를 재사용할 수 있습니다.
   */
  async getUserSetting(userId: number): Promise<UserSettingOutput> {
    const key = RedisKey.hash.userSetting(userId);
    // 사용자 설정 캐시의 모든 필드를 조회합니다.
    // 전체 필드와 값을 반환하며, 저장된 데이터가 없으면 빈 객체를 반환합니다.
    const hash = await redis.hGetAll(key);

    const setting = parseUserSettingHash(userId, hash);

    if (setting) {
      const hasMissingField = USER_SETTING_HASH_FIELDS.some(
        (field) => hash[field] === undefined,
      );

      if (hasMissingField) {
        // 일부 필드만 남은 Hash도 반환값에는 기본값이 병합됩니다.
        // 누락이 있을 때만 병합 결과를 저장해 불필요한 쓰기를 피합니다.
        await this.saveUserSettingToHash(setting);
      }

      return setting;
    }

    const defaultSetting = defaultUserSetting(userId);

    await this.saveUserSettingToHash(defaultSetting);

    return defaultSetting;
  }

  /**
   * 사용자 설정 일부를 수정합니다.
   *
   * 1. getUserSetting으로 사용자 설정이 없으면 기본 설정을 먼저 생성합니다.
   * 2. undefined가 아닌 입력 항목만 수정 대상에 포함합니다.
   * 3. updatedAt은 현재 시간으로 갱신합니다.
   * 4. hSet으로 전달된 항목만 Redis Hash에 반영합니다.
   * 5. 갱신된 사용자 설정 전체를 다시 조회해 반환합니다.
   *
   * 실습 포인트:
   * Redis Hash는 전체 객체를 다시 저장하지 않아도 필요한 field만 부분 수정할 수 있습니다.
   */
  async updateUserSetting(
    userId: number,
    input: UpdateUserSettingInput,
  ): Promise<UserSettingOutput> {
    // key가 없을 때 일부 항목만 저장되는 일을 막기 위해 기본 설정 전체를 먼저 보장합니다.
    // 설정 Hash가 없거나 불완전할 수 있으므로,
    // 업데이트 전에 기본 설정 필드 전체가 존재하도록 보장한다.
    await this.getUserSetting(userId);

    const key = RedisKey.hash.userSetting(userId);

    const fieldsToUpdate: Record<string, string> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.theme !== undefined) {
      fieldsToUpdate.theme = input.theme;
    }

    if (input.language !== undefined) {
      fieldsToUpdate.language = input.language;
    }

    if (input.emailNotification !== undefined) {
      fieldsToUpdate.emailNotification = String(input.emailNotification);
    }

    if (input.smsNotification !== undefined) {
      fieldsToUpdate.smsNotification = String(input.smsNotification);
    }

    if (input.marketingAgreed !== undefined) {
      fieldsToUpdate.marketingAgreed = String(input.marketingAgreed);
    }

    // 사용자 설정 캐시의 필드 값을 저장하거나 갱신합니다.
    // 여러 필드를 함께 저장하고 새로 추가된 필드 수를 반환하며, 기존 필드는 값을 덮어씁니다.
    await redis.hSet(key, fieldsToUpdate);

    return this.getUserSetting(userId);
  }

  /**
   * 특정 설정 필드만 Redis Hash에서 직접 조회합니다.
   *
   * 1. userId로 사용자 설정 key를 만듭니다.
   * 2. hGet으로 요청한 항목 하나만 조회합니다.
   * 3. Redis에 저장된 원시 문자열 값을 그대로 반환합니다.
   *
   * 실습 포인트:
   * Redis Hash는 전체 설정을 읽지 않고 필요한 field 하나만 조회할 수 있습니다.
   * userId 필드를 제외한 나머지 필드명만 field 값으로 사용됩니다.
   * boolean field도 Redis에는 문자열로 저장되므로 이 메서드는 문자열을 반환합니다.
   */
  async getSettingField(
    userId: number,
    field: keyof Omit<UserSettingOutput, 'userId'>,
  ): Promise<string | null> {
    const key = RedisKey.hash.userSetting(userId);
    // 사용자 설정 캐시에서 필요한 필드 하나를 조회합니다.
    // 필드 값을 반환하며, 해당 필드나 데이터가 없으면 null을 반환합니다.
    return redis.hGet(key, field);
  }

  /**
   * 사용자 설정 Hash를 삭제합니다.
   *
   * 1. userId로 사용자 설정 key를 만듭니다.
   * 2. 해당 사용자 설정을 Redis에서 삭제합니다.
   *
   * 실습 포인트:
   * 설정 Hash를 삭제하면 다음 조회 시 기본 설정이 다시 생성됩니다.
   */
  async deleteUserSetting(userId: number): Promise<void> {
    const key = RedisKey.hash.userSetting(userId);
    // 사용자 설정 캐시 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
