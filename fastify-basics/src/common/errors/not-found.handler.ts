// /src/common/errors/not-found.handler.ts
// 등록된 라우트와 일치하지 않는 요청을 처리하는 핸들러입니다.

import type { FastifyReply, FastifyRequest } from 'fastify';

import { ErrorCode } from './error.codes';
import type { ErrorResponse } from './error.schema';

/**
 * Fastify가 요청에 맞는 라우트를 찾지 못했을 때 호출됩니다.
 * 요청 정보를 로그로 남기고 일관된 형식의 404 응답을 반환합니다.
 */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  // 어떤 요청이 실패했는지 추적할 수 있도록 요청 식별자와 경로를 함께 기록합니다.
  request.log.info(
    {
      // 애플리케이션에서 사용하는 오류 코드와 HTTP 상태 코드
      code: ErrorCode.ROUTE_NOT_FOUND,
      statusCode: 404,
      // 문제가 발생한 개별 요청을 식별하기 위한 정보
      requestId: request.id,
      method: request.method,
      url: request.url,
    },
    'Route not found',
  );

  // status(404)로 HTTP 상태를 지정한 뒤 send()로 응답 본문을 전송합니다.
  // reply를 반환하면 Fastify가 이 응답의 처리 완료를 추적할 수 있습니다.
  return reply.status(404).send({
    // 모든 오류 응답에서 공통으로 사용하는 실패 표시
    success: false,
    // 클라이언트가 오류 종류를 프로그램적으로 구분할 때 사용하는 코드
    code: ErrorCode.ROUTE_NOT_FOUND,
    // 사용자나 개발자가 읽을 수 있는 오류 설명
    message: '요청한 API를 찾을 수 없습니다.',
  } satisfies ErrorResponse);
}
