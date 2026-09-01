import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * 비밀번호 저장 관점에서 SHA-512와 scrypt의 차이
 *
 * | 구분        | SHA-512                                          | scrypt                                       |
 * |-------------|--------------------------------------------------|----------------------------------------------|
 * | 주 용도     | 데이터 무결성 검증, 디지털 서명                  | 비밀번호 해시                                |
 * | 연산 특성   | 빠른 처리를 목적으로 하는 해시 함수              | 의도적으로 느린 키 유도 함수                 |
 * | 공격 저항성 | GPU/ASIC 병렬 무차별 대입 공격에 상대적으로 취약 | 많은 메모리를 요구해 GPU/ASIC 공격 비용 증가 |
 *
 * SHA-512는 빠른 계산 속도가 중요한 범용 해시에는 적합하지만,
 * 공격자의 비밀번호 후보 대입도 빠르게 해주므로 비밀번호를
 * 단독 SHA-512로 저장하는 용도에는 적합하지 않습니다.
 */

// scrypt가 만들 파생 키의 길이입니다. 단위는 바이트이며 64바이트는 512비트입니다.
// verify()에서도 같은 길이를 사용해야 저장된 해시와 새 계산 결과를 비교할 수 있습니다.
const KEY_LENGTH = 64;

// DB 문자열이 어떤 알고리즘으로 만들어졌는지 구분해 이후 형식 변경에 대응합니다.
const HASH_PREFIX = 'scrypt';

/** 서비스가 특정 비밀번호 해시 알고리즘에 의존하지 않도록 공통 인터페이스를 정의합니다. */
export interface PasswordHasher {
  // 비밀번호 원문을 단방향 해시 문자열로 변환합니다.
  // 같은 비밀번호라도 매번 새로운 salt를 사용하므로 서로 다른 결과가 만들어집니다.
  hash(password: string): Promise<string>;

  // 사용자가 입력한 비밀번호와 DB에 저장된 해시가 같은 비밀번호를 나타내는지 확인합니다.
  verify(password: string, encodedHash: string): Promise<boolean>;
}

/**
 * 콜백 기반 scrypt를 Promise로 감싸 서비스에서 await로 사용할 수 있게 합니다.
 * scrypt는 비밀번호와 salt로 계산 비용이 큰 고정 길이 파생 키를 만듭니다.
 */
function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      // 계산 과정에서 메모리 부족 등의 오류가 발생하면 호출자에게 그대로 전달합니다.
      if (error !== null) {
        reject(error);
        return;
      }

      // 성공 시 생성된 Buffer를 반환합니다. 비밀번호 원문은 결과에 포함되지 않습니다.
      resolve(derivedKey);
    });
  });
}

/**
 * 추가 패키지 없이 Node.js 내장 scrypt를 사용하는 비밀번호 해시 구현입니다.
 * 결과는 복호화하는 암호문이 아니라 입력 비밀번호를 검증할 때 다시 계산하는 단방향 값입니다.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  /** 무작위 salt와 scrypt 파생 키를 하나의 저장 가능한 문자열로 만듭니다. */
  async hash(password: string): Promise<string> {
    // 사용자마다 예측하기 어려운 16바이트 솔트를 새로 만들어 같은 비밀번호도 서로 다르게 해시합니다.
    const salt = randomBytes(16);

    // 원문 비밀번호 자체를 저장하지 않고 scrypt가 계산한 파생 키만 사용합니다.
    const derivedKey = await deriveKey(password, salt);

    // 알고리즘, 솔트, 파생 키를 함께 저장해야 나중에 비밀번호를 검증할 수 있습니다.
    // 저장 형식: scrypt$<base64url 솔트>$<base64url 파생 키>
    // base64url은 바이너리 데이터를 DB에 안전한 문자열로 표현하기 위한 인코딩일 뿐 암호화가 아닙니다.
    return [HASH_PREFIX, salt.toString('base64url'), derivedKey.toString('base64url')].join('$');
  }

  /** 입력 비밀번호로 파생 키를 다시 계산해 저장된 값과 일정한 시간에 비교합니다. */
  async verify(password: string, encodedHash: string): Promise<boolean> {
    // hash()가 '$'로 연결한 알고리즘, 솔트, 파생 키를 다시 분리합니다.
    // 네 번째 값이 존재하면 예상보다 구분자가 많은 잘못된 형식입니다.
    const [algorithm, saltText, hashText, extraPart] = encodedHash.split('$');

    // 저장된 값이 애플리케이션의 해시 형식과 다르면 인증 실패로 처리합니다.
    if (
      algorithm !== HASH_PREFIX ||
      saltText === undefined ||
      hashText === undefined ||
      extraPart !== undefined
    ) {
      return false;
    }

    try {
      // base64url 문자열로 저장된 솔트와 파생 키를 암호 연산에 사용할 Buffer로 복원합니다.
      const salt = Buffer.from(saltText, 'base64url');
      const expectedKey = Buffer.from(hashText, 'base64url');

      // 빈 솔트 또는 예상 길이가 아닌 키는 손상되었거나 지원하지 않는 해시로 취급합니다.
      // timingSafeEqual()은 두 Buffer 길이가 다르면 예외를 던지므로 미리 길이도 확인합니다.
      if (salt.length === 0 || expectedKey.length !== KEY_LENGTH) {
        return false;
      }

      // 로그인 요청의 비밀번호와 같은 솔트를 사용해 비교할 파생 키를 다시 계산합니다.
      const actualKey = await deriveKey(password, salt);

      // timingSafeEqual()은 비교 결과가 드러나는 시간 차이를 줄이는 바이트 비교 함수입니다.
      // 항상 모든 바이트를 끝까지 검사하고, 길이가 다르면 예외를 던져 비교하지 않습니다.
      return timingSafeEqual(actualKey, expectedKey);
    } catch {
      // 손상된 인코딩이나 scrypt 계산 오류가 인증 API의 500 오류로 노출되지 않게 실패로 처리합니다.
      return false;
    }
  }
}
