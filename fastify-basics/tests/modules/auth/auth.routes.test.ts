/**
 * 인증 라우트의 요청 검증, 토큰 발급, 쿠키 설정과 세션 저장을 함께 확인하는 통합 테스트입니다.
 * app.inject()를 사용하므로 실제 네트워크 포트를 열지 않고도 Fastify의 전체 요청 처리 흐름을 실행합니다.
 */

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/common/errors/error.codes';
import { errorHandler } from '../../../src/common/errors/error.handler';
import { ScryptPasswordHasher } from '../../../src/common/security/password-hasher';
import { env } from '../../../src/config/env';
import authRoutes from '../../../src/modules/auth/auth.routes';
import authenticationPlugin from '../../../src/plugins/authentication.plugin';
import prismaPlugin from '../../../src/plugins/prisma.plugin';

describe('authRoutes', () => {
  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  beforeAll(async () => {
    // 개발 서버와 같은 Prisma 플러그인과 비어 있는 개발 DB를 테스트에서도 그대로 사용합니다.
    app.setErrorHandler(errorHandler);
    await app.register(prismaPlugin);
    await app.register(authenticationPlugin);
    await app.register(authRoutes, { prefix: '/auth' });
    // ready()는 등록한 플러그인과 라우트의 초기화가 모두 끝날 때까지 기다립니다.
    await app.ready();
    await clearDatabase();
  });

  afterEach(async () => {
    // 각 테스트가 생성한 데이터를 모두 삭제해 다음 테스트가 항상 빈 DB에서 시작하게 합니다.
    await clearDatabase();
  });

  afterAll(async () => {
    // 테스트가 중간에 실패해 afterEach 정리가 끝나지 않은 경우를 대비해 한 번 더 정리합니다.
    await clearDatabase();
    // Prisma 플러그인의 onClose hook이 개발 DB 연결도 함께 종료합니다.
    await app.close();
  });

  /** 로그인 성공 시나리오에서 공통으로 사용할 활성 사용자를 실제 해시 비밀번호와 함께 저장합니다. */
  async function createActiveUser() {
    const passwordHash = await new ScryptPasswordHasher().hash('Password12!');
    const user = await app.prisma.user.create({
      data: {
        email: `vitest-auth-${randomUUID()}@example.com`,
        passwordHash,
        displayName: '사용자',
      },
    });

    return user;
  }

  /** 반복되는 로그인 요청을 같은 입력으로 실행해 각 테스트가 검증할 응답을 반환합니다. */
  async function login(email: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'Password12!' },
    });
  }

  /** 외래 키로 사용자를 참조하는 세션을 먼저 지운 뒤 사용자 테이블을 비웁니다. */
  async function clearDatabase(): Promise<void> {
    await app.prisma.session.deleteMany();
    await app.prisma.user.deleteMany();
  }

  it('로그인·재발급·로그아웃·전체 로그아웃 경로를 등록한다', () => {
    // hasRoute()는 실제 요청을 보내지 않고 HTTP 메서드와 URL 조합이 등록됐는지만 확인합니다.
    // 라우트 구현이 삭제되거나 메서드·경로가 바뀌면 해당 검증이 실패합니다.
    expect(app.hasRoute({ method: 'POST', url: '/auth/login' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/auth/refresh' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/auth/logout' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/auth/logout-all' })).toBe(true);
  });

  it('로그인 요청 형식이 잘못되면 공통 400 오류를 반환한다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: '' },
    });

    // 잘못된 입력은 로그인 서비스가 실행되기 전에 TypeBox 요청 스키마에서 거절됩니다.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('로그인하면 Access Token은 본문에, Refresh Token은 HttpOnly 쿠키에 반환한다', async () => {
    const user = await createActiveUser();

    const response = await login(user.email);
    const body = response.json<Record<string, unknown>>();
    // set-cookie는 문자열 또는 문자열 배열일 수 있으므로 문자열로 정규화해 쿠키 속성을 검사합니다.
    const setCookie = String(response.headers['set-cookie']);

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      user: { email: user.email, role: 'USER' },
    });
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('refreshToken');
    expect(setCookie).toContain(`${env.AUTH_REFRESH_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    await expect(app.prisma.session.count({ where: { userId: user.id } })).resolves.toBe(1);
  });

  it('Refresh Token 쿠키를 회전하고 새 Access Token을 반환한다', async () => {
    const user = await createActiveUser();
    const loginResponse = await login(user.email);
    // 다음 요청의 Cookie 헤더에는 Set-Cookie의 속성을 제외한 이름=값 부분만 전달합니다.
    const currentCookie = String(loginResponse.headers['set-cookie']).split(';')[0];

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: currentCookie },
    });
    const nextCookie = String(response.headers['set-cookie']).split(';')[0];

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tokenType: 'Bearer' });
    expect(nextCookie).not.toBe(currentCookie);
    // 회전은 기존 세션을 추가하는 대신 토큰 해시를 교체하므로 세션 수는 한 개로 유지됩니다.
    await expect(app.prisma.session.count({ where: { userId: user.id } })).resolves.toBe(1);

    // 이미 회전된 이전 Refresh Token은 탈취된 토큰의 재사용으로 간주해 거절해야 합니다.
    const reusedResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: currentCookie },
    });
    expect(reusedResponse.statusCode).toBe(401);
    expect(reusedResponse.json()).toMatchObject({ code: ErrorCode.TOKEN_REVOKED });
  });

  it('로그아웃하면 현재 Session을 삭제하고 Refresh Token 쿠키를 만료시킨다', async () => {
    const user = await createActiveUser();
    const loginResponse = await login(user.email);
    const cookie = String(loginResponse.headers['set-cookie']).split(';')[0];

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    // 응답 본문이 없는 204와 별개로 Set-Cookie 헤더를 통해 브라우저의 Refresh Token도 만료시킵니다.
    expect(String(response.headers['set-cookie'])).toContain(`${env.AUTH_REFRESH_COOKIE_NAME}=`);
    await expect(app.prisma.session.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it('인증 없이 전체 로그아웃을 요청하면 공통 401 오류를 반환한다', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/logout-all' });

    // 보호 라우트의 authenticate preHandler가 Access Token이 없는 요청을 핸들러 전에 차단합니다.
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      code: ErrorCode.UNAUTHORIZED,
    });
  });
});
