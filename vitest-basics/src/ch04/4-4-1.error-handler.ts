import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

import { AppError } from './4-4-1.app-errors';

export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // AppError 처리
  if (error instanceof AppError) {
    // Record<string, unknown>은 키가 문자열이고 값은 사용 전 확인이 필요한 객체 타입입니다.
    const payload: Record<string, unknown> = {
      error: error.name,
      code: error.code,
      message: error.message,
    };

    if (error.details !== undefined) {
      payload.details = error.details;
    }

    return reply.code(error.statusCode).send(payload);
  }

  // Fastify Validation Error
  if (error.validation) {
    return reply.code(400).send({
      error: 'ValidationError',
      code: 'VALIDATION_ERROR',
      message: '입력 데이터가 유효하지 않습니다',
      details: {
        validation: error.validation,
        validationContext: error.validationContext,
      },
    });
  }

  // 예상하지 못한 내부 오류의 상세 내용은 서버에만 기록하고 클라이언트에는 노출하지 않습니다.
  console.error('Unexpected error:', error);

  return reply.code(500).send({
    error: 'InternalServerError',
    code: 'INTERNAL_SERVER_ERROR',
    message: '서버 내부 오류가 발생했습니다',
  });
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.code(404).send({
    error: 'NotFound',
    code: 'NOT_FOUND',
    message: '요청한 리소스를 찾을 수 없습니다',
    details: {
      url: request.url,
      method: request.method,
    },
  });
}
