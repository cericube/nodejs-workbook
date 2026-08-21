// 요청 처리 중 발생한 오류를 공통 HTTP 응답으로 변환합니다.

import type { FastifyReply, FastifyRequest } from 'fastify';

import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from './error.codes';
import { BusinessError } from './business.error';
import type { ErrorResponse } from './error.schema';

// Fastify가 요청 스키마 검증에 실패했을 때 제공하는 주요 속성입니다.
interface FastifyValidationError extends Error {
  validation: unknown;
  validationContext?: string;
  statusCode?: number;
}

/**
 * 전달받은 값이 Fastify의 요청 스키마 검증 오류인지 확인합니다.
 * 반환값이 true이면 이후 코드에서 error의 타입을 FastifyValidationError 취급한다.
 */
function isValidationError(error: unknown): error is FastifyValidationError {
  // 'validation' in error;
  // error 객체에 validation이라는 프로퍼티가 존재하는지 확인
  return error instanceof Error && 'validation' in error;
}

/**
 * Fastify 전역 오류 처리기
 *
 * 오류 종류에 따라 HTTP 상태, 애플리케이션 오류 코드, 메시지를 결정한 뒤
 * 로그를 남기고 동일한 형식의 응답을 반환합니다.
 *
 * - BusinessError: 오류에 미리 지정된 값 사용
 * - 요청 스키마 검증 오류: 400 응답
 * - 처리되지 않은 Prisma 오류 및 그 밖의 오류: 500 응답
 */
export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  // 어떤 분기에도 해당하지 않는 오류는 내부 서버 오류로 처리합니다.
  let statusCode = 500;
  let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
  let message = '서버 내부 오류가 발생했습니다.';

  // 애플리케이션이 의도적으로 발생시킨 오류는 지정된 응답 정보를 그대로 사용합니다.
  if (error instanceof BusinessError) {
    statusCode = error.statusCode;
    errorCode = error.errorCode;
    message = error.message;
  }

  // 요청의 body, params, query 등이 JSON Schema와 맞지 않으면 400으로 응답합니다.
  else if (isValidationError(error)) {
    // error is FastifyValidationError 코드 때문에
    // 여기서는 error를 FastifyValidationError로 취급
    // 없으면 const validationError = error as FastifyValidationError; 해야 함.
    statusCode = 400;
    errorCode = ErrorCode.VALIDATION_ERROR;
    message = '입력 형식이 올바르지 않습니다.';
  }

  // 비즈니스 오류로 변환되지 않은 Prisma 오류의 세부 내용은 클라이언트에 노출하지 않습니다.
  else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = 500;
    errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    message = '서버 내부 오류가 발생했습니다.';
  }

  // 5xx는 서버에서 조사해야 할 오류이므로 원본 오류와 stack trace를 error 레벨로 남깁니다.
  if (statusCode >= 500) {
    request.log.error(
      {
        err: error,
        code: errorCode,
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'Request failed',
    );
  } else {
    // 4xx는 잘못된 요청 등 예상 가능한 거절이므로 요청 정보만 info 레벨로 남깁니다.
    request.log.info(
      {
        code: errorCode,
        statusCode,
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'Request rejected',
    );
  }

  // satisfies는 객체의 타입을 바꾸지 않고 ErrorResponse 형식에 맞는지만 검사합니다.
  return reply.status(statusCode).send({
    success: false,
    code: errorCode,
    message,
  } satisfies ErrorResponse);
}
