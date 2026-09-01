/**
 * 인증 의존성을 조립하고 로그인·재발급·로그아웃 HTTP 경로를 등록합니다.
 * 로그인과 재발급은 새 액세스 JWT를 만들기 위한 공개 경로이고, logout-all은 현재 사용자
 * 식별이 필요하므로 유효한 액세스 JWT를 요구하는 보호 경로입니다.
 */

/* eslint-disable @typescript-eslint/require-await */

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { FastifyAccessTokenIssuer } from '../../common/security/access-token-issuer';
import { authenticate } from '../../common/security/auth.guard';
import { ScryptPasswordHasher } from '../../common/security/password-hasher';
import { Sha256RefreshTokenManager } from '../../common/security/refresh-token-manager';
import { env } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import {
  LoginRouteSchema,
  LogoutAllRouteSchema,
  LogoutRouteSchema,
  RefreshRouteSchema,
} from './auth.schema';
import { AuthService } from './auth.service';

const authRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // 라우트에서 저장소 → 서비스 → 컨트롤러의 의존 관계를 한곳에서 구성합니다.
  // Fastify에 등록된 Prisma와 JWT 구현은 필요한 객체에 생성자 인자로 전달합니다.
  const authRepository = new AuthRepository(fastify.prisma);
  const passwordHasher = new ScryptPasswordHasher();
  const refreshTokenManager = new Sha256RefreshTokenManager();
  // Fastify 전용 JWT API를 공통 인터페이스로 감싸 서비스가 웹 프레임워크를 몰라도 되게 합니다.
  const accessTokenIssuer = new FastifyAccessTokenIssuer(
    fastify.jwt,
    env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
  );
  const authService = new AuthService(
    authRepository,
    passwordHasher,
    refreshTokenManager,
    accessTokenIssuer,
    {
      accessTokenExpiresIn: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresIn: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    },
  );

  const authController = new AuthController(authService, {
    refreshCookieName: env.AUTH_REFRESH_COOKIE_NAME,
    secureCookie: env.NODE_ENV === 'production',
  });

  fastify.post(
    '/login',
    {
      schema: LoginRouteSchema,
      // 비밀번호 대입 공격을 줄이기 위해 로그인 요청 횟수를 IP 기준으로 제한합니다.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    (request, reply) => authController.login(request.body, reply),
  );

  fastify.post(
    '/refresh',
    {
      schema: RefreshRouteSchema,
      // 정상적인 액세스 토큰 재발급은 허용하되 비정상적인 반복 요청은 제한합니다.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    (request, reply) => authController.refresh(request, reply),
  );

  fastify.post('/logout', { schema: LogoutRouteSchema }, (request, reply) =>
    authController.logout(request, reply),
  );

  fastify.post(
    '/logout-all',
    // preHandler는 본문 핸들러보다 먼저 실행되며, authenticate가 검증한 사용자 정보만
    // 컨트롤러에 전달되므로 클라이언트가 임의의 userId를 지정해 다른 세션을 지울 수 없습니다.
    { schema: LogoutAllRouteSchema, preHandler: [authenticate] },
    (request, reply) => authController.logoutAll(request, reply),
  );
};

export default authRoutes;
