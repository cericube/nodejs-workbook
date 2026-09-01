import type { FastifyInstance } from 'fastify';

import type { AccessTokenIssuer, AccessTokenPayload } from '../../modules/auth/auth.types';

/**
 * AuthService가 Fastify에 직접 의존하지 않도록 JWT 기능을 AccessTokenIssuer로 감쌉니다.
 * 실제 JWT 구현과 만료 시간은 라우트에서 주입하므로 서비스는 페이로드 전달에만 집중할 수 있습니다.
 */
export class FastifyAccessTokenIssuer implements AccessTokenIssuer {
  constructor(
    // authentication.plugin.ts가 Fastify 인스턴스에 추가한 JWT 서명 객체를 주입받습니다.
    // FastifyInstance['jwt']는 jwt라는 등록 이름이 아니라 FastifyInstance의 jwt 속성 타입을
    // 가져오는 TypeScript 인덱스 접근 타입입니다.
    private readonly jwt: FastifyInstance['jwt'],
    // JWT의 exp 클레임을 계산할 액세스 토큰 유효 시간이며 단위는 초입니다.
    private readonly expiresIn: number,
  ) {}

  /**
   * 사용자 식별 정보와 권한을 서명해 짧게 사용하는 액세스 JWT를 반환합니다.
   * 클라이언트는 이 값을 `Authorization: Bearer <token>` 헤더에 담아 보호 API를 호출합니다.
   */
  issue(payload: AccessTokenPayload): Promise<string> {
    // @fastify/jwt의 sign()은 동기적으로 문자열을 반환하므로 서비스 인터페이스에 맞게 감쌉니다.
    return Promise.resolve(this.jwt.sign(payload, { expiresIn: this.expiresIn }));
  }
}
