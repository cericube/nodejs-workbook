/**
 * 사용자 라우트의 요청 검증, JWT 인증·인가와 데이터 변경 결과를 함께 확인하는 통합 테스트입니다.
 * app.inject()로 실제 포트 없이 Fastify hook, 스키마, 컨트롤러와 Prisma 저장소까지 실행합니다.
 */

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/common/errors/error.codes';
import { errorHandler } from '../../../src/common/errors/error.handler';
import { ScryptPasswordHasher } from '../../../src/common/security/password-hasher';
import userRoutes from '../../../src/modules/user/user.routes';
import { UserRole, UserStatus } from '../../../src/modules/user/user.types';
import authenticationPlugin from '../../../src/plugins/authentication.plugin';
import prismaPlugin from '../../../src/plugins/prisma.plugin';

describe('userRoutes', () => {
  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  beforeAll(async () => {
    // 개발 서버와 동일한 Prisma 플러그인으로 개발 DB에 연결하고 실제 스키마를 사용합니다.
    app.setErrorHandler(errorHandler);
    await app.register(prismaPlugin);
    // 테스트 전용 비밀키를 주입하면 실행 환경의 JWT 설정과 분리된 재현 가능한 토큰을 만들 수 있습니다.
    await app.register(authenticationPlugin, {
      secret: 'test-jwt-secret-with-at-least-32-characters',
    });
    await app.register(userRoutes, { prefix: '/users' });
    // ready() 이후에는 플러그인 초기화가 끝나 hasRoute()와 inject()를 안전하게 사용할 수 있습니다.
    await app.ready();
    await clearDatabase();
  });

  afterEach(async () => {
    // 테스트에서 추가하거나 변경한 데이터를 모두 삭제해 다음 테스트의 초기 상태를 비워 둡니다.
    await clearDatabase();
  });

  afterAll(async () => {
    // 테스트 실패로 afterEach가 완료되지 않은 경우를 대비해 남은 테스트 데이터를 다시 정리합니다.
    await clearDatabase();
    // Prisma 연결 해제는 실제 플러그인에 등록된 onClose hook이 담당합니다.
    await app.close();
  });

  /** 인가 시나리오에 맞는 역할을 가진 사용자를 고유한 이메일로 생성합니다. */
  async function createUser(role: typeof UserRole.USER | typeof UserRole.ADMIN = UserRole.USER) {
    const passwordHash = await new ScryptPasswordHasher().hash('Password12!');
    const user = await app.prisma.user.create({
      data: {
        // 한 테스트에서 일반 사용자와 관리자를 함께 생성해도 email 고유 제약과 충돌하지 않게 합니다.
        email: `vitest-user-${role.toLowerCase()}-${randomUUID()}@example.com`,
        passwordHash,
        displayName: role === UserRole.ADMIN ? '관리자' : '사용자',
        role,
      },
    });

    return user;
  }

  /** 인증 플러그인의 실제 서명 기능으로 보호 라우트에 전달할 Access Token을 만듭니다. */
  function accessToken(user: { id: number; email: string; role: 'USER' | 'ADMIN' }): string {
    return app.jwt.sign({
      // sub는 URL의 사용자 ID와 비교되며 role은 관리자 전용 작업의 인가 판단에 사용됩니다.
      sub: String(user.id),
      email: user.email,
      role: user.role,
      type: 'access',
    });
  }

  /** 외래 키 제약을 지키도록 세션을 먼저 삭제하고 사용자 테이블을 비웁니다. */
  async function clearDatabase(): Promise<void> {
    await app.prisma.session.deleteMany();
    await app.prisma.user.deleteMany();
  }

  it('회원가입·조회·비밀번호·상태·탈퇴 경로를 등록한다', () => {
    // hasRoute()는 핸들러의 동작이 아니라 각 HTTP 메서드와 URL 조합의 등록 여부만 검사합니다.
    // 실제 요청 검증, 인증·인가와 응답 내용은 아래의 통합 시나리오에서 별도로 확인합니다.
    expect(app.hasRoute({ method: 'POST', url: '/users/' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/users/:id' })).toBe(true);
    expect(app.hasRoute({ method: 'PATCH', url: '/users/:id/password' })).toBe(true);
    expect(app.hasRoute({ method: 'PATCH', url: '/users/:id/status' })).toBe(true);
    expect(app.hasRoute({ method: 'DELETE', url: '/users/:id' })).toBe(true);
  });

  it('회원가입 요청을 검증하고 생성된 공개 사용자 정보를 반환한다', async () => {
    const email = `vitest-user-register-${randomUUID()}@example.com`;
    const response = await app.inject({
      method: 'POST',
      url: '/users/',
      payload: {
        email: email.toUpperCase(),
        password: 'Password12!',
        displayName: ' 새 사용자 ',
      },
    });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(201);
    // 입력 정규화와 안전한 기본 role·status가 HTTP 응답에도 반영되는지 확인합니다.
    expect(body).toMatchObject({
      email,
      displayName: '새 사용자',
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
    });
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('회원가입 요청 형식이 잘못되면 공통 400 오류를 반환한다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/',
      payload: { email: 'invalid', password: 'short' },
    });

    // email과 password가 요청 스키마를 통과하지 못하면 사용자 생성 전에 공통 검증 오류가 반환됩니다.
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
      // Bearer 스킴으로 전달한 JWT를 authenticate preHandler가 검증하고 request.user에 저장합니다.
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

    // 신원은 확인됐지만 ADMIN 역할이 없으므로 인증 실패(401)가 아닌 권한 부족(403)입니다.
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
    // HTTP 응답뿐 아니라 실제 저장 상태도 검사해 서비스와 저장소 계층의 변경까지 보장합니다.
    await expect(app.prisma.user.findUnique({ where: { id: user.id } })).resolves.toMatchObject({
      status: UserStatus.SUSPENDED,
    });
  });
});
