/** 인증 도메인의 서비스와 저장소가 공유하는 타입을 정의합니다. */

import type { UserRole, UserStatus } from '../user/user.types';

/** 로그인 검증과 토큰 발급에 필요한 사용자 조회 결과입니다. */
export interface AuthUserResult {
  id: number;
  email: string;
  passwordHash: string;
  status: UserStatus;
  role: UserRole;
  withdrawnAt: Date | null;
}

/** 리프레시 토큰으로 조회한 세션과 연결된 사용자 상태를 함께 표현합니다. */
export interface AuthSessionResult {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  user: AuthUserResult;
}

/** 리프레시 토큰 원문 대신 해시와 만료 시각을 저장할 세션 생성 데이터입니다. */
export interface CreateSessionData {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

/** Access JWT에 서명하는 계층을 Fastify 구현과 분리하기 위한 인터페이스입니다. */
export interface AccessTokenIssuer {
  // 구현체는 페이로드에 서명하고 전송 가능한 JWT 문자열을 비동기로 반환합니다.
  issue(payload: AccessTokenPayload): Promise<string>;
}

/**
 * 액세스 JWT에 저장되며 검증 후 request.user의 기반이 되는 페이로드입니다.
 * JWT는 요청마다 DB에서 세션을 조회하지 않고 사용자와 권한을 확인하기 위한 짧은 수명의 증명서입니다.
 */
export interface AccessTokenPayload {
  // sub는 JWT 표준 subject 클레임이며 문자열 형태의 사용자 ID입니다.
  sub: string;
  email: string;
  role: UserRole;
  type: 'access';
}

/**
 * JWT 검증 후 Fastify가 request.user에 저장하는 타입입니다.
 * iat(발급 시각)와 exp(만료 시각)는 sign() 과정에서 플러그인이 추가하므로 선택 속성으로 둡니다.
 */
export interface AuthenticatedUser extends AccessTokenPayload {
  iat?: number;
  exp?: number;
}

/** 서비스가 컨트롤러에 전달하는 토큰, 만료 정보, 공개 사용자 정보입니다. */
export interface AuthTokenResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: {
    id: number;
    email: string;
    role: UserRole;
  };
}
