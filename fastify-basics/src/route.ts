// src/routes.ts
import type { FastifyInstance } from 'fastify';

import userRoutes from './modules/user/user.routes';

export function routes(fastify: FastifyInstance) {
  // /users 경로에 대한 모든 라우트를 userRoutes에서 처리합니다.
  fastify.register(userRoutes, { prefix: '/users' });
}
