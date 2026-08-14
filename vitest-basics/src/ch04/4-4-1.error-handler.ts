import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from './4-4-1.app-errors';

export function errorHandler(
  error: FastifyError | AppError,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
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
