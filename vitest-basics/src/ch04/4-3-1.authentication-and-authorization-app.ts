import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface AuthenticatedUser {
  id: number;
  name: string;
}

type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser };

export async function verifyToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Promise 기반 Hook의 완료 시점을 Fastify가 기다리도록 비동기로 선언합니다.
  await Promise.resolve();
  const auth = request.headers.authorization;

  if (!auth) {
    reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: '토큰이 필요합니다.',
    });
    return;
  }

  if (auth !== 'Bearer valid-token') {
    reply.status(403).send({
      code: 'FORBIDDEN',
      message: '권한이 없습니다.',
    });
    return;
  }

  // 인증을 통과한 요청에 테스트용 사용자 정보를 저장합니다.
  (request as AuthenticatedRequest).user = { id: 1, name: 'Jane' };
}

export function meRoutes(app: FastifyInstance) {
  app.route({
    method: 'GET',
    url: '/me',
    // Fastify는 Promise 기반 Hook을 지원하지만 ESLint는 void callback으로 판정합니다.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    preHandler: verifyToken,
    handler: (request) => {
      return { user: (request as AuthenticatedRequest).user };
    },
  });
}

export function buildApp() {
  const app = Fastify();
  app.register(meRoutes);
  return app;
}
