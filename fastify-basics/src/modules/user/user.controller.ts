/**
 * 사용자 요청을 처리하는 HTTP 컨트롤러입니다.
 * 검증된 요청을 서비스에 전달하고 처리 결과를 HTTP 상태 코드와 응답 DTO로 변환합니다.
 */

import type { FastifyReply } from 'fastify';

import type {
  RegisterUserBodyDto,
  UpdateUserPasswordBodyDto,
  UpdateUserStatusBodyDto,
  UserIdParamsDto,
  UserResponseDto,
  WithdrawUserBodyDto,
} from './user.schema';
import type { UserService } from './user.service';
import type { UserResult } from './user.types';

export class UserController {
  // 비즈니스 처리는 서비스에 위임하고 컨트롤러는 HTTP 입력과 응답 변환만 담당합니다.
  constructor(private readonly userService: UserService) {}

  /**
   * 회원가입 요청 본문을 서비스에 전달하고 생성된 사용자를 201 응답으로 반환합니다.
   * 비밀번호는 서비스에서 해시하며 응답에는 포함하지 않습니다.
   */
  async register(body: RegisterUserBodyDto, reply: FastifyReply) {
    const user = await this.userService.register(body);
    return reply.code(201).send(toUserResponse(user));
  }

  /**
   * 경로 파라미터의 사용자 ID로 상세 정보를 조회해 200 응답으로 반환합니다.
   * 사용자가 없으면 서비스에서 발생한 BusinessError를 전역 오류 처리기가 404 응답으로 변환합니다.
   */
  async getById(params: UserIdParamsDto, reply: FastifyReply) {
    const user = await this.userService.getById(params.id);
    return reply.code(200).send(toUserResponse(user));
  }

  /** 현재 비밀번호 검증 후 새 비밀번호로 변경하고 본문 없는 204 응답을 반환합니다. */
  async updatePassword(
    params: UserIdParamsDto,
    body: UpdateUserPasswordBodyDto,
    reply: FastifyReply,
  ) {
    await this.userService.updatePassword(params.id, body);
    return reply.code(204).send();
  }

  /** 관리자가 지정한 사용자의 계정 상태를 ACTIVE 또는 SUSPENDED로 변경합니다. */
  async updateStatus(params: UserIdParamsDto, body: UpdateUserStatusBodyDto, reply: FastifyReply) {
    const user = await this.userService.updateStatus(params.id, body.status);
    return reply.code(200).send(toUserResponse(user));
  }

  /** 현재 비밀번호를 확인한 뒤 사용자를 소프트 탈퇴 처리하고 204 응답을 반환합니다. */
  async withdraw(params: UserIdParamsDto, body: WithdrawUserBodyDto, reply: FastifyReply) {
    await this.userService.withdraw(params.id, body.currentPassword);
    return reply.code(204).send();
  }
}

/**
 * 서비스의 UserResult를 외부에 공개할 HTTP 응답 형태로 변환합니다.
 * Date는 ISO 8601 문자열로 변환하며, 입력 타입에 없는 passwordHash는 응답에도 포함되지 않습니다.
 */
function toUserResponse(user: UserResult): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    role: user.role,
    withdrawnAt: user.withdrawnAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
