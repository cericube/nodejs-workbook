// src/routes.ts
import type { FastifyInstance } from 'fastify';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';

export function routes(fastify: FastifyInstance) {
  fastify.register(authRoutes, { prefix: '/auth' });

  // /users 경로에 대한 모든 라우트를 userRoutes에서 처리합니다.
  fastify.register(userRoutes, { prefix: '/users' });
}
