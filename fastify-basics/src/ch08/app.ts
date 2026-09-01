/* eslint-disable @typescript-eslint/require-await */

import { fastifyCookie } from '@fastify/cookie';
import { fastifySession } from '@fastify/session';
import Fastify from 'fastify';

import { authenticateUser, findUserById, requireAuth, toPublicUser } from './auth.js';

// 세션 쿠키의 유효 기간을 7일로 설정합니다. cookie.maxAge 옵션은 밀리초 단위입니다.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const SESSION_COOKIE_NAME = 'session_id';

// @fastify/session이 요구하는 32자 이상의 예제용 쿠키 서명 비밀키입니다.
// 실제 서비스에서는 소스 코드에 저장하지 말고 환경 변수나 비밀 관리 도구를 통해 주입해야 합니다.
const SESSION_SECRET = 'local-ch08-session-secret-change-me-1234';

/** 로그인 API의 요청 본문을 나타내는 TypeScript 타입입니다. */
interface LoginBody {
  email: string;
  password: string;
}

declare module 'fastify' {
  // 모듈 보강으로 request.session에 저장할 사용자 정의 필드를 Fastify의 Session 타입에 추가합니다.
  // 비밀번호나 전체 사용자 객체 대신 인증에 필요한 최소 정보만 세션에 보관합니다.
  interface Session {
    userId?: number;
    role?: 'USER' | 'ADMIN';
  }
}

/**
 * 별도의 데이터베이스나 Redis 없이 세션 인증 흐름을 학습할 수 있는 Fastify 앱을 만듭니다.
 * 기본 메모리 저장소는 학습과 테스트에만 사용하고, 운영 환경에서는 Redis 같은 공유 저장소로 교체해야 합니다.
 */
export function buildCh08App() {
  const app = Fastify({ logger: true });

  // @fastify/session이 요청의 쿠키를 읽을 수 있도록 @fastify/cookie를 먼저 등록합니다.
  app.register(fastifyCookie);

  // @fastify/session은 세션 데이터를 서버 쪽 저장소에 보관하고 브라우저에는 서명된 세션 ID만 보냅니다.
  app.register(fastifySession, {
    // secret은 세션 ID 쿠키에 서명하고 쿠키의 변조 여부를 확인하는 데 사용합니다.
    secret: SESSION_SECRET,

    // store는 세션 데이터를 보관할 저장소를 지정하는 옵션입니다.
    // 생략하면 서버 재시작 시 데이터가 사라지는 기본 메모리 저장소를 사용하며, 아래는 Redis 저장소를 지정하는 예시입니다.
    // store: redisStore,

    cookieName: SESSION_COOKIE_NAME,

    // 세션에 아무 값도 저장하지 않았다면 세션 저장소에 세션을 만들지 않고, 세션 쿠키도 발급하지 않습니다.
    saveUninitialized: false,

    // 요청이 들어올 때마다 쿠키 만료 시각을 현재 시점에서 SESSION_TTL_MS만큼 연장합니다.
    // 따라서 마지막 요청 후 SESSION_TTL_MS 동안 추가 요청이 없으면 세션 쿠키가 만료됩니다.
    rolling: true,
    cookie: {
      // 브라우저의 JavaScript에서 쿠키에 접근하지 못하게 해 XSS 공격으로 인한 쿠키 탈취 위험을 줄입니다.
      httpOnly: true,

      // 로컬 HTTP 환경에서도 쿠키를 전송하도록 false로 설정합니다. 운영 환경의 HTTPS에서는 true를 사용해야 합니다.
      secure: false,

      // 외부 사이트에서 시작된 대부분의 요청에는 쿠키 전송을 제한하되, 일반적인 링크 이동은 허용합니다.
      sameSite: 'lax',

      // 애플리케이션의 모든 경로에서 이 세션 쿠키를 전송합니다.
      path: '/',

      // 세션 쿠키는 마지막으로 갱신된 시점부터 7일 동안 유지됩니다.
      maxAge: SESSION_TTL_MS,
    },
  });

  // 라우트 핸들러가 반환한 객체는 Fastify가 JSON 응답으로 변환합니다.
  app.get('/health', async () => ({ status: 'ok' as const }));

  /** 이메일과 비밀번호를 검증한 뒤 로그인 세션을 생성하는 API입니다. */
  app.post<{ Body: LoginBody }>('/api/login', async (request, reply) => {
    const { email, password } = request.body ?? {};

    // LoginBody는 컴파일할 때만 검사되는 타입이므로 외부에서 받은 값은 실행 중에도 검증해야 합니다.
    if (typeof email !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({
        code: 'INVALID_REQUEST',
        message: 'email과 password 문자열이 필요합니다.',
      });
    }

    const user = authenticateUser(email, password);

    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호를 확인해 주세요.',
      });
    }

    // 기존 세션 ID를 폐기하고 새 ID를 발급해 세션 고정 공격을 방지합니다.
    await request.session.regenerate();

    // 이후 요청에서 사용자를 식별하고 권한을 확인할 수 있도록 최소한의 인증 정보만 세션에 저장합니다.
    request.session.userId = user.id;
    request.session.role = user.role;

    // 비밀번호와 계정 상태를 제외한 공개 사용자 정보를 JSON 응답으로 반환합니다.
    return { user: toPublicUser(user) };
  });

  /** 로그인 세션을 확인한 뒤 현재 사용자 정보를 반환하는 보호 API입니다. */
  app.get('/api/me', { preHandler: [requireAuth] }, async (request, reply) => {
    // preHandler가 userId의 존재를 먼저 확인하므로 여기서는 null 아님 단언 연산자(!)를 사용할 수 있습니다.
    // 세션에는 ID만 저장하고 계정 정지 여부처럼 바뀔 수 있는 정보는 요청할 때마다 사용자 저장소에서 확인합니다.
    const user = findUserById(request.session.userId!);

    if (!user || user.status !== 'ACTIVE') {
      // 사용자가 삭제되거나 정지되었다면 남아 있는 로그인 세션도 즉시 무효화합니다.
      await request.session.destroy();

      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: '유효한 로그인 세션이 아닙니다.',
      });
    }

    return { user: toPublicUser(user) };
  });

  /** 서버의 세션 데이터와 브라우저의 세션 ID 쿠키를 함께 삭제하는 로그아웃 API입니다. */
  app.post('/api/logout', async (request, reply) => {
    // 현재 세션 ID에 연결된 로그인 정보를 서버의 세션 저장소에서 삭제합니다.
    await request.session.destroy();

    // 쿠키를 만들 때와 같은 이름과 경로를 지정해 브라우저의 세션 ID 쿠키도 만료시킵니다.
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });

    return { success: true as const };
  });

  // 아직 listen을 호출하지 않은 앱을 반환하므로 테스트에서는 실제 포트를 열지 않고 inject로 요청할 수 있습니다.
  return app;
}
