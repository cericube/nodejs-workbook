// src/modules/user/user.controller.ts
import type { FastifyReply } from 'fastify';
import type { Static } from 'typebox';

import { UserIdParamsSchema, type UserResponseDto } from './user.schema';
import type { UserService } from './user.service';

// Controller 입력 타입도 Route에서 사용하는 TypeBox 스키마에서 추출합니다.
type UserIdParamsDto = Static<typeof UserIdParamsSchema>;

// HTTP 요청을 Service 호출로 연결하고, Service 결과를 HTTP 응답 형태로 변환합니다.
export class UserController {
  // 비즈니스 로직을 직접 만들지 않고 외부에서 전달받은 Service에 위임합니다.
  constructor(private readonly userService: UserService) {}

  // 스키마 검증을 통과한 경로 파라미터로 사용자 한 명을 조회합니다.
  async getById(params: UserIdParamsDto, reply: FastifyReply) {
    // 사용자가 없으면 Service가 BusinessError를 던지고 전역 오류 처리기가 응답합니다.
    const user = await this.userService.getById(params.id);

    // HTTP 경계인 Controller에서 Date를 JSON 응답용 문자열로 변환합니다.
    const response: UserResponseDto = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };

    // Controller가 성공 상태 코드와 HTTP 응답을 결정합니다.
    return reply.code(200).send(response);
  }
}
