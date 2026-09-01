import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/common/errors/error.codes';
import { errorHandler } from '../../../src/common/errors/error.handler';
import { ScryptPasswordHasher } from '../../../src/common/security/password-hasher';
import userRoutes from '../../../src/modules/user/user.routes';
import { UserRole, UserStatus } from '../../../src/modules/user/user.types';
import authenticationPlugin from '../../../src/plugins/authentication.plugin';
import { clearAuthData, createAuthSchema, createTestPrisma } from '../test-database';

describe('userRoutes', () => {
  const prisma = createTestPrisma();
  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  beforeAll(async () => {
    await prisma.$connect();
    await createAuthSchema(prisma);
    app.setErrorHandler(errorHandler);
    app.decorate('prisma', prisma);
    await app.register(authenticationPlugin, {
      secret: 'test-jwt-secret-with-at-least-32-characters',
    });
    await app.register(userRoutes, { prefix: '/users' });
    await app.ready();
  });

  beforeEach(async () => {
    await clearAuthData(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createUser(role: typeof UserRole.USER | typeof UserRole.ADMIN = UserRole.USER) {
    const passwordHash = await new ScryptPasswordHasher().hash('Password12!');
    return prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${randomUUID()}@example.com`,
        passwordHash,
        displayName: role === UserRole.ADMIN ? '관리자' : '사용자',
        role,
      },
    });
  }

  function accessToken(user: { id: number; email: string; role: 'USER' | 'ADMIN' }): string {
    return app.jwt.sign({
      sub: String(user.id),
      email: user.email,
      role: user.role,
      type: 'access',
    });
  }

  it('회원가입·조회·비밀번호·상태·탈퇴 경로를 등록한다', () => {
    expect(app.hasRoute({ method: 'POST', url: '/users/' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/users/:id' })).toBe(true);
    expect(app.hasRoute({ method: 'PATCH', url: '/users/:id/password' })).toBe(true);
    expect(app.hasRoute({ method: 'PATCH', url: '/users/:id/status' })).toBe(true);
    expect(app.hasRoute({ method: 'DELETE', url: '/users/:id' })).toBe(true);
  });

  it('회원가입 요청을 검증하고 생성된 공개 사용자 정보를 반환한다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/',
      payload: {
        email: 'NEW@Example.COM',
        password: 'Password12!',
        displayName: ' 새 사용자 ',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      email: 'new@example.com',
      displayName: '새 사용자',
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
    });
    expect(response.json()).not.toHaveProperty('passwordHash');
  });

  it('회원가입 요청 형식이 잘못되면 공통 400 오류를 반환한다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/',
      payload: { email: 'invalid', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('인증 없이 사용자 상세 정보를 요청하면 401 오류를 반환한다', async () => {
    const user = await createUser();

    const response = await app.inject({ method: 'GET', url: `/users/${user.id}` });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });

  it('인증된 사용자가 자신의 상세 정보를 조회한다', async () => {
    const user = await createUser();

    const response = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: { authorization: `Bearer ${accessToken(user)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: user.id, email: user.email });
    expect(response.json()).not.toHaveProperty('passwordHash');
  });

  it('일반 사용자의 상태 변경 요청을 403 오류로 거절한다', async () => {
    const user = await createUser();

    const response = await app.inject({
      method: 'PATCH',
      url: `/users/${user.id}/status`,
      headers: { authorization: `Bearer ${accessToken(user)}` },
      payload: { status: UserStatus.SUSPENDED },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('관리자가 사용자의 상태를 변경한다', async () => {
    const user = await createUser();
    const admin = await createUser(UserRole.ADMIN);

    const response = await app.inject({
      method: 'PATCH',
      url: `/users/${user.id}/status`,
      headers: { authorization: `Bearer ${accessToken(admin)}` },
      payload: { status: UserStatus.SUSPENDED },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: user.id, status: UserStatus.SUSPENDED });
    await expect(prisma.user.findUnique({ where: { id: user.id } })).resolves.toMatchObject({
      status: UserStatus.SUSPENDED,
    });
  });
});
