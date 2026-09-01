import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/common/errors/error.codes';
import { errorHandler } from '../../../src/common/errors/error.handler';
import { ScryptPasswordHasher } from '../../../src/common/security/password-hasher';
import { env } from '../../../src/config/env';
import authRoutes from '../../../src/modules/auth/auth.routes';
import authenticationPlugin from '../../../src/plugins/authentication.plugin';
import { clearAuthData, createAuthSchema, createTestPrisma } from '../test-database';

describe('authRoutes', () => {
  const prisma = createTestPrisma();
  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  beforeAll(async () => {
    await prisma.$connect();
    await createAuthSchema(prisma);
    app.setErrorHandler(errorHandler);
    app.decorate('prisma', prisma);
    await app.register(authenticationPlugin);
    await app.register(authRoutes, { prefix: '/auth' });
    await app.ready();
  });

  beforeEach(async () => {
    await clearAuthData(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createActiveUser() {
    const passwordHash = await new ScryptPasswordHasher().hash('Password12!');
    return prisma.user.create({
      data: {
        email: 'user@example.com',
        passwordHash,
        displayName: '사용자',
      },
    });
  }

  async function login() {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.com', password: 'Password12!' },
    });
  }

  it('로그인·재발급·로그아웃·전체 로그아웃 경로를 등록한다', () => {
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

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('로그인하면 Access Token은 본문에, Refresh Token은 HttpOnly 쿠키에 반환한다', async () => {
    await createActiveUser();

    const response = await login();
    const body = response.json<Record<string, unknown>>();
    const setCookie = String(response.headers['set-cookie']);

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      user: { email: 'user@example.com', role: 'USER' },
    });
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('refreshToken');
    expect(setCookie).toContain(`${env.AUTH_REFRESH_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    await expect(prisma.session.count()).resolves.toBe(1);
  });

  it('Refresh Token 쿠키를 회전하고 새 Access Token을 반환한다', async () => {
    await createActiveUser();
    const loginResponse = await login();
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
    await expect(prisma.session.count()).resolves.toBe(1);

    const reusedResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: currentCookie },
    });
    expect(reusedResponse.statusCode).toBe(401);
    expect(reusedResponse.json()).toMatchObject({ code: ErrorCode.TOKEN_REVOKED });
  });

  it('로그아웃하면 현재 Session을 삭제하고 Refresh Token 쿠키를 만료시킨다', async () => {
    await createActiveUser();
    const loginResponse = await login();
    const cookie = String(loginResponse.headers['set-cookie']).split(';')[0];

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers['set-cookie'])).toContain(`${env.AUTH_REFRESH_COOKIE_NAME}=`);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it('인증 없이 전체 로그아웃을 요청하면 공통 401 오류를 반환한다', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/logout-all' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      code: ErrorCode.UNAUTHORIZED,
    });
  });
});
