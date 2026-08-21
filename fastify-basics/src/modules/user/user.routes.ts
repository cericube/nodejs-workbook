// src/modules/user/user.routes.ts

// Fastify 비동기 플러그인 타입을 사용하지만 현재 등록 과정에는 await가 없어 규칙을 비활성화합니다.
/* eslint-disable @typescript-eslint/require-await */

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { UserController } from './user.controller';
import { GetUserRouteSchema } from './user.schema';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

// 사용자 관련 객체를 조립하고 엔드포인트를 Fastify에 등록하는 플러그인입니다.
const userRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // Repository → Service → Controller 순서로 각 계층의 의존성을 주입합니다.
  // prisma.plugin.ts가 Fastify에 추가한 공유 Prisma Client를 Repository에 전달합니다.
  const userRepository = new UserRepository(fastify.prisma);
  const userService = new UserService(userRepository);
  const userController = new UserController(userService);

  // 상위 플러그인의 prefix와 결합되어 GET /api/users/:id 엔드포인트가 됩니다.
  fastify.get(
    '/:id',
    {
      // 요청 검증, 응답 직렬화와 타입 추론에 같은 계약을 사용합니다.
      schema: GetUserRouteSchema,
    },
    // Fastify가 검증하고 타입을 추론한 params와 reply를 Controller에 전달합니다.
    (request, reply) => userController.getById(request.params, reply),
  );
};

// 상위 routes 플러그인이 prefix와 함께 등록할 수 있도록 내보냅니다.
export default userRoutes;
