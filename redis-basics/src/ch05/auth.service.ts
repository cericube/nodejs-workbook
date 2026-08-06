// src/ch05/auth.service.ts

import { redis } from '../shared/redis';
import { RedisKey } from '../shared/redis-key';

// 저장된 코드 비교와 삭제를 Redis 서버에서 하나의 원자적 작업으로 실행합니다.
// 코드가 다르면 Key와 기존 TTL을 그대로 유지합니다.
const VERIFY_AND_DELETE_SCRIPT = `
  local savedCode = redis.call('GET', KEYS[1])

  if savedCode == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end

  return 0
`;

/**
 * Redis String과 TTL을 이용해 일회용 이메일 인증 코드를 관리합니다.
 *
 * 인증 성공 시 코드를 즉시 삭제하므로 같은 코드를 다시 사용할 수 없습니다.
 * 검증과 삭제는 Lua Script로 원자적으로 처리해 동시 재사용을 방지합니다.
 */
export class AuthService {
  /**
   * 인증 코드 생성
   *
   * 100000 ~ 999999 사이의 6자리 숫자 문자열을 만듭니다.
   * 실습에서는 Math.random()을 사용하지만,
   * 보안이 중요한 실제 서비스에서는 crypto 기반 난수 생성을 권장합니다.
   *
   * @returns 6자리 숫자로 구성된 인증 코드입니다.
   */
  generateAuthCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * 이메일 인증 코드 저장
   *
   * 1. 6자리 인증 코드를 생성합니다.
   * 2. 이메일을 포함한 Redis key를 만듭니다.
   * 3. Redis String에 인증 코드를 저장하고 TTL 180초를 설정합니다.
   *
   * 반환한 authCode는 실제 서비스에서는 이메일/SMS로 발송하고,
   * API 응답으로 직접 노출하지 않는 것이 일반적입니다.
   *
   * @param email 인증 코드를 발급할 이메일 주소입니다.
   * @returns Redis에 저장된 6자리 인증 코드입니다.
   */
  async saveEmailAuthCode(email: string): Promise<string> {
    const authCode = this.generateAuthCode();

    // 이메일별로 인증 코드를 따로 저장하기 위한 key입니다.
    // 예: string:auth-code:test@example.com
    const key = RedisKey.string.authCode(email);

    // 이메일 인증 코드를 제한 시간 동안 저장합니다.
    // EX 옵션으로 180초 뒤 만료되게 저장하며, 성공하면 OK를 반환합니다.
    await redis.set(key, authCode, {
      EX: 180,
    });

    return authCode;
  }

  /**
   * 이메일 인증 코드 검증
   *
   * 1. Redis 서버에서 저장된 코드와 입력 코드를 비교합니다.
   * 2. 코드가 일치하면 같은 원자적 작업 안에서 key를 삭제합니다.
   * 3. key가 없거나 코드가 다르면 기존 값을 변경하지 않고 false를 반환합니다.
   *
   * @param email 인증 코드를 발급받은 이메일 주소입니다.
   * @param inputCode 사용자가 입력한 인증 코드입니다.
   * @returns 코드가 일치하면 true, 없거나 일치하지 않으면 false입니다.
   */
  async verifyEmailAuthCode(email: string, inputCode: string): Promise<boolean> {
    const key = RedisKey.string.authCode(email);

    // EVAL은 Script 전체를 중간 개입 없이 실행하므로 같은 코드를 사용한
    // 동시 요청 중 실제 Key를 삭제한 한 요청만 성공합니다.
    const deletedCount = await redis.eval(VERIFY_AND_DELETE_SCRIPT, {
      keys: [key],
      arguments: [inputCode],
    });

    return deletedCount === 1;
  }

  /**
   * 인증 코드 남은 시간 확인
   *
   * Redis TTL 명령으로 key의 남은 만료 시간을 초 단위로 확인합니다.
   * - 양수: 남은 시간(초)
   * - -2: key가 없음
   * - -1: key는 있지만 만료 시간이 없음
   *
   * @param email 남은 인증 시간을 확인할 이메일 주소입니다.
   * @returns Redis TTL 명령의 결과입니다.
   */
  async getAuthCodeTtl(email: string): Promise<number> {
    const key = RedisKey.string.authCode(email);
    // 이메일 인증 코드의 남은 유효 시간을 조회합니다.
    // TTL을 초 단위로 반환하며, 만료 설정이 없으면 -1을, 데이터가 없으면 -2를 반환합니다.
    return redis.ttl(key);
  }
}
