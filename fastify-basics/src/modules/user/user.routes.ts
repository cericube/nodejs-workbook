/**
 * 사용자 라우트를 등록하는 Fastify 플러그인입니다.
 * 저장소 → 서비스 → 컨트롤러의 의존 관계를 구성하고 URL과 HTTP 메서드를 등록합니다.
 */

/* eslint-disable @typescript-eslint/require-await */

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import {
  authenticate,
  requireAdmin,
  requireSelf,
  requireSelfOrAdmin,
} from '../../common/security/auth.guard';
import { ScryptPasswordHasher } from '../../common/security/password-hasher';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import {
  GetUserRouteSchema,
  RegisterUserRouteSchema,
  UpdateUserPasswordRouteSchema,
  UpdateUserStatusRouteSchema,
  WithdrawUserRouteSchema,
} from './user.schema';
import { UserService } from './user.service';

const userRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // 라우트에서 계층별 구현을 생성하고 각 객체에 필요한 의존성을 순서대로 주입합니다.
  const userRepository = new UserRepository(fastify.prisma);
  const passwordHasher = new ScryptPasswordHasher();
  const userService = new UserService(userRepository, passwordHasher);
  const userController = new UserController(userService);

  // POST /api/users - 사용자를 등록합니다.
  fastify.post('/', { schema: RegisterUserRouteSchema }, (request, reply) =>
    userController.register(request.body, reply),
  );

  // 이 모듈의 preHandler는 모두 Promise를 반환하는 async 함수로 통일합니다.
  // Fastify hook은 async 방식과 done 콜백 방식 중 하나로 완료를 알려야 하며,
  // 한 방식을 일관되게 사용하면 done() 누락으로 요청 처리가 끝나지 않는 문제를 방지할 수 있습니다.

  // GET /api/users/:id - 액세스 JWT 인증 후 본인 또는 관리자만 상세 정보를 조회할 수 있습니다.
  fastify.get(
    '/:id',
    // preHandler 배열은 왼쪽부터 실행되므로 먼저 JWT로 신원을 확인한 뒤 소유권을 검사합니다.
    { schema: GetUserRouteSchema, preHandler: [authenticate, requireSelfOrAdmin] },
    (request, reply) => userController.getById(request.params, reply),
  );

  // PATCH /api/users/:id/password - 본인 여부와 현재 비밀번호를 확인한 뒤 비밀번호를 변경합니다.
  fastify.patch(
    '/:id/password',
    // 유효한 JWT의 sub와 경로의 :id가 같은 사용자만 자신의 비밀번호를 변경할 수 있습니다.
    { schema: UpdateUserPasswordRouteSchema, preHandler: [authenticate, requireSelf] },
    (request, reply) => userController.updatePassword(request.params, request.body, reply),
  );

  // PATCH /api/users/:id/status - 관리자만 사용자의 활성·정지 상태를 변경할 수 있습니다.
  fastify.patch(
    '/:id/status',
    // JWT에 서명된 role을 검사하므로 요청 본문으로 관리자 역할을 가장할 수 없습니다.
    { schema: UpdateUserStatusRouteSchema, preHandler: [authenticate, requireAdmin] },
    (request, reply) => userController.updateStatus(request.params, request.body, reply),
  );

  // DELETE /api/users/:id - 현재 비밀번호를 확인한 뒤 논리적으로 탈퇴시키고 모든 세션을 폐기합니다.
  fastify.delete(
    '/:id',
    { schema: WithdrawUserRouteSchema, preHandler: [authenticate, requireSelf] },
    (request, reply) => userController.withdraw(request.params, request.body, reply),
  );
};

export default userRoutes;
