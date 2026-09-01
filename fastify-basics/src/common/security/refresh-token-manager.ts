import { createHash, randomBytes } from 'node:crypto';

/** 리프레시 토큰 원문을 생성하고 DB 저장용 해시로 변환하는 기능입니다. */
export interface RefreshTokenManager {
  // 클라이언트 쿠키로 전달할 예측하기 어려운 원문 토큰을 만듭니다.
  generate(): string;
  // 원문 토큰을 DB 저장과 조회에 사용할 고정 길이 해시로 변환합니다.
  hash(token: string): string;
}

/**
 * 예측하기 어려운 불투명(opaque) 리프레시 토큰을 만들고 SHA-256 해시로 변환합니다.
 * 토큰 원문은 쿠키로만 전달하고 DB에는 해시만 저장해 DB 유출 시 재사용 위험을 줄입니다.
 * JWT처럼 사용자 정보를 담지 않으며, 서버는 해시와 일치하는 DB 세션을 조회해 유효성을 판단합니다.
 */
export class Sha256RefreshTokenManager implements RefreshTokenManager {
  /** 암호학적으로 안전한 48바이트 난수를 URL과 쿠키에 안전한 문자열로 인코딩합니다. */
  generate(): string {
    // base64url은 일반 Base64의 +, /, = 문자를 피하므로 별도 URL 인코딩 없이 전달할 수 있습니다.
    return randomBytes(48).toString('base64url');
  }

  /** 동일한 원문이 항상 같은 결과가 되도록 SHA-256으로 해시해 세션 조회 키를 만듭니다. */
  hash(token: string): string {
    // 해시는 복호화하는 암호화가 아니라 원문을 직접 저장하지 않기 위한 단방향 변환입니다.
    // 토큰 자체가 충분히 긴 난수이므로 비밀번호용 scrypt 대신 빠른 SHA-256을 사용합니다.
    return createHash('sha256').update(token, 'utf8').digest('base64url');
  }
}
