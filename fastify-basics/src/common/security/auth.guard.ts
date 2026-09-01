/**
 * JWT 인증과 사용자 역할·소유권 검사를 라우트에서 재사용할 수 있게 제공합니다.
 * 인증(authentication)은 사용자가 누구인지 확인하고, 인가(authorization)는 해당 작업을
 * 수행할 권한이 있는지 확인하는 과정입니다.
 */

/* eslint-disable @typescript-eslint/require-await */

import type { FastifyRequest } from 'fastify';

import { BusinessError } from '../errors/business.error';
import { ErrorCode } from '../errors/error.codes';
import { UserRole } from '../../modules/user/user.types';

/**
 * Authorization 헤더의 Bearer 액세스 JWT를 검증하고 결과를 request.user에 저장합니다.
 * 보호할 라우트의 preHandler 첫 번째 단계에 배치해야 뒤의 인가 함수가 request.user를
 * 안전하게 사용할 수 있으며, 인증 실패 시 라우트 핸들러는 실행되지 않습니다.
 */
export async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    // jwtVerify()는 서명과 만료 시간을 검증하고 성공한 페이로드를 request.user에 저장합니다.
    await request.jwtVerify();
  } catch (error) {
    // 플러그인 오류 코드를 애플리케이션의 일관된 BusinessError 응답으로 변환합니다.
    const code = readErrorCode(error);

    if (code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      throw new BusinessError(ErrorCode.TOKEN_EXPIRED, 'Access Token이 만료되었습니다.', 401);
    }

    if (code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      throw new BusinessError(ErrorCode.UNAUTHORIZED, '인증이 필요합니다.', 401);
    }

    throw new BusinessError(ErrorCode.TOKEN_INVALID, '유효하지 않은 Access Token입니다.', 401);
  }

  // 서명이 유효해도 이 API에서 허용하는 액세스 토큰인지 별도로 확인합니다.
  // 이후 다른 용도의 JWT가 추가되더라도 리프레시 토큰 등이 보호 API에 사용되는 것을 막습니다.
  if (request.user.type !== 'access') {
    throw new BusinessError(ErrorCode.TOKEN_INVALID, '유효하지 않은 토큰 종류입니다.', 401);
  }
}

/**
 * authenticate 실행 후 인증된 사용자가 ADMIN 역할을 가졌는지 확인합니다.
 * 신원을 증명하지 못한 경우는 401, 신원은 확인됐지만 권한이 부족한 경우는 403으로 구분합니다.
 */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (request.user.role !== UserRole.ADMIN) {
    throw new BusinessError(ErrorCode.FORBIDDEN, '관리자 권한이 필요합니다.', 403);
  }
}

/** authenticate 실행 후 JWT의 사용자 ID와 URL의 사용자 ID가 같은지 확인합니다. */
export async function requireSelf(request: FastifyRequest): Promise<void> {
  if (request.user.sub !== String(readUserIdParam(request.params))) {
    throw new BusinessError(ErrorCode.FORBIDDEN, '본인의 사용자 정보만 변경할 수 있습니다.', 403);
  }
}

/** authenticate 실행 후 본인 또는 관리자에게만 허용되는 경로인지 검사합니다. */
export async function requireSelfOrAdmin(request: FastifyRequest): Promise<void> {
  // 첫 번째 조건이 거짓인 관리자는 URL의 사용자 ID를 비교하지 않고 통과합니다.
  if (
    request.user.role !== UserRole.ADMIN &&
    request.user.sub !== String(readUserIdParam(request.params))
  ) {
    throw new BusinessError(ErrorCode.FORBIDDEN, '접근 권한이 없습니다.', 403);
  }
}

/** 타입을 알 수 없는 params에서 정수 형태의 사용자 ID를 안전하게 꺼냅니다. */
function readUserIdParam(params: unknown): number {
  // 런타임 값이 객체이고 id 속성이 있는지 확인한 뒤에만 속성에 접근합니다.
  if (typeof params !== 'object' || params === null || !('id' in params)) {
    throw new BusinessError(ErrorCode.FORBIDDEN, '사용자 식별 정보를 확인할 수 없습니다.', 403);
  }

  const id = params.id;
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new BusinessError(ErrorCode.FORBIDDEN, '사용자 식별 정보를 확인할 수 없습니다.', 403);
  }

  return id;
}

/** 타입을 알 수 없는 오류에 문자열 code가 있을 때만 Fastify 오류 코드로 반환합니다. */
function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}
