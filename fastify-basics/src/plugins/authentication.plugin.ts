/**
 * 인증에 필요한 쿠키, JWT, 요청 횟수 제한 기능을 Fastify 인스턴스에 등록합니다.
 * 액세스 토큰은 서명된 JWT로 요청마다 사용자를 확인하고, 리프레시 토큰은 HttpOnly 쿠키와
 * DB 세션으로 관리해 만료된 액세스 토큰을 다시 발급하는 데 사용합니다.
 */

import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env';
import { ErrorCode } from '../common/errors/error.codes';
import type { AccessTokenPayload, AuthenticatedUser } from '../modules/auth/auth.types';

export interface AuthenticationPluginOptions {
  // 지정하지 않으면 환경 변수에서 읽은 기본 비밀키를 사용합니다.
  secret?: string;
}

/**
 * @fastify/jwt가 사용하는 데이터의 모양을 TypeScript에 알려 줍니다.
 * 실제 객체를 새로 만드는 코드는 아니며, JWT를 만들 때 넣는 값과 검증 후
 * request.user에서 읽을 수 있는 값의 타입을 지정합니다.
 */
declare module '@fastify/jwt' {
  // FastifyJWT는 @fastify/jwt가 열어 둔 타입 확장용 인터페이스입니다.
  // 모듈 보강으로 아래 속성을 선언하면 플러그인의 실행 코드를 바꾸지 않고 sign() 입력과
  // jwtVerify() 결과를 이 애플리케이션의 인증 타입에 맞춰 정적 검사할 수 있습니다.
  interface FastifyJWT {
    // fastify.jwt.sign()으로 액세스 토큰을 만들 때 전달하는 사용자 정보입니다.
    payload: AccessTokenPayload;
    // request.jwtVerify()가 토큰 검증에 성공한 뒤 request.user에 저장하는 정보입니다.
    user: AuthenticatedUser;
  }
}

/**
 * 인증 라우트가 공통으로 사용하는 쿠키, JWT, 요청 횟수 제한 기능을 등록합니다.
 * app.ts에서 비즈니스 라우트보다 먼저 등록해야 request.cookies, request.jwtVerify()와
 * fastify.jwt를 이후 라우트와 인증·인가 가드에서 사용할 수 있습니다.
 */
const authenticationPlugin: FastifyPluginAsync<AuthenticationPluginOptions> = async (
  fastify,
  options,
) => {
  // options의 타입은 AuthenticationPluginOptions 타입입니다.
  // 테스트처럼 별도 비밀키가 필요한 경우 플러그인 옵션으로 환경 설정을 재정의할 수 있습니다.
  const secret = options.secret ?? env.JWT_ACCESS_SECRET;

  // 비밀키가 비어 있거나 지나치게 짧으면 서버 시작 단계에서 즉시 실패시킵니다.
  // 이렇게 하면 잘못된 설정으로 JWT를 발급한 뒤 런타임에서 문제를 발견하는 상황을 막습니다.
  if (secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET은 32자 이상으로 설정해야 합니다.');
  }

  // @fastify/cookie는 request.cookies 읽기와 reply.setCookie()/clearCookie()를 추가합니다.
  // 리프레시 토큰은 서명 쿠키가 아니라 DB의 토큰 해시로 무결성과 폐기 여부를 검증합니다.
  await fastify.register(cookie);

  // @fastify/jwt는 발급용 fastify.jwt.sign()과 검증용 request.jwtVerify()를 추가합니다.
  // 서버만 아는 secret으로 서명을 확인하므로 클라이언트가 JWT 페이로드를 변조하면 검증에 실패합니다.
  // JWT 페이로드는 암호화되지 않으므로 비밀번호나 민감한 개인정보를 넣으면 안 됩니다.
  await fastify.register(jwt, { secret });

  // global: false이면 모든 요청을 자동으로 제한하지 않고,
  // 라우트에 config.rateLimit 설정이 있는 로그인과 토큰 재발급 같은
  // 민감한 엔드포인트에만 제한을 적용합니다.
  await fastify.register(rateLimit, {
    global: false,
    // 기본 플러그인 오류 대신 애플리케이션의 공통 오류 응답과 같은 구조를 반환합니다.
    errorResponseBuilder: () => ({
      success: false,
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: '요청 횟수 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.',
    }),
  });
};

// fastify-plugin으로 감싸 플러그인에서 추가한 데코레이터가 캡슐화되지 않도록 하고,
// 이후 등록되는 인증·사용자 라우트에서도 사용할 수 있게 합니다.
export default fp<AuthenticationPluginOptions>(authenticationPlugin, {
  // 이름은 Fastify가 플러그인을 식별하고 의존 관계나 중복 등록 문제를 표시할 때 사용합니다.
  name: 'authentication-plugin',
});
