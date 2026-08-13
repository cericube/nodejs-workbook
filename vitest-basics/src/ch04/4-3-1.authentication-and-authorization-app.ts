import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface AuthenticatedUser {
  id: number;
  name: string;
}

type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser };

export async function verifyToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Promise 기반 hook으로 선언하면 성공 경로에서도 Fastify가 완료 시점을 정확히 인식합니다.
  await Promise.resolve();
  const auth = request.headers.authorization;

  if (!auth) {
    reply.status(401).send({ code: 'UNAUTHORIZED', message: '토큰이 필요합니다.' });
    return;
  }

  if (auth !== 'Bearer valid-token') {
    reply.status(403).send({ code: 'FORBIDDEN', message: '권한이 없습니다.' });
    return;
  }

  // 인증 통과 시 사용자 정보 설정
  (request as AuthenticatedRequest).user = { id: 1, name: 'Jane' };
  return undefined;
}

export async function verifyAdminToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await Promise.resolve();
  const auth = request.headers.authorization;

  if (!auth) {
    reply.status(401).send({ code: 'UNAUTHORIZED', message: '토큰 필요' });
    return;
  }

  if (auth === 'Bearer user-token') {
    reply.status(403).send({ code: 'FORBIDDEN', message: '관리자 전용입니다.' });
    return;
  }

  if (auth === 'Bearer admin-token') {
    return;
  }

  reply.status(403).send({ status: '잘못된 접근' });
}

export function meRoutes(app: FastifyInstance) {
  app.route({
    method: 'GET',
    url: '/me',
    // Fastify는 Promise 기반 hook을 지원하지만 현재 ESLint 타입 판정은 void callback으로 오인합니다.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    preHandler: verifyToken,
    handler: (request) => {
      // preHandler가 성공한 뒤 주입한 사용자 정보를 반환합니다.
      return { user: (request as AuthenticatedRequest).user };
    },
  });
}

export function adminRoutes(app: FastifyInstance) {
  app.route({
    method: 'GET',
    url: '/admin',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    preHandler: verifyAdminToken,
    handler: () => {
      return { status: '관리자 접근 성공' };
    },
  });
}

/////////////////////////////////////////////
import Fastify from 'fastify';

/**
 * 테스트 및 서버 실행용 App Builder
 * - Vitest에서는 이 함수로 app 생성 후 inject() 사용
 * - 실제 서버에서는 listen 전에 동일 함수 사용
 */
export function buildApp() {
  const app = Fastify({
    logger: false, // 테스트 시 불필요한 로그 제거
  });

  app.register(meRoutes);
  app.register(adminRoutes);

  return app;
}
