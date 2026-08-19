/* eslint-disable @typescript-eslint/require-await */

import type { FastifyInstance } from 'fastify';

// 사용자와 관련된 API를 하나의 라우트 플러그인으로 정의합니다.
export async function userRoutes(fastify: FastifyInstance) {
  // GET /users 요청을 처리합니다.
  fastify.get('/', async () => {
    return { users: [] };
  });

  // GET /users/:id 요청에서 경로 매개변수로 사용자 ID를 받습니다.
  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string };

    return {
      id,
      name: 'John Doe',
    };
  });
}
