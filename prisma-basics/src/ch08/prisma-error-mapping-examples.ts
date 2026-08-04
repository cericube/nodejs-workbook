import { Prisma } from '../../generated/prisma/client';
import {
  AppError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  ServiceUnavailableError,
  toErrorResponseBody,
} from './application-errors';

/**
 * Prisma 또는 알 수 없는 오류를 외부에 공개 가능한 AppError로 변환합니다.
 *
 * 오류 메시지 문자열은 버전이나 DB에 따라 달라질 수 있으므로 알려진 요청 오류는
 * instanceof 확인 후 안정적으로 제공되는 code를 기준으로 분기합니다.
 */
export function mapPrismaError(error: unknown): AppError {
  // Service가 이미 비즈니스 의미로 바꾼 오류는 다시 변환하지 않습니다.
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new ConflictError('이미 존재하는 리소스입니다.', 'DUPLICATE_RESOURCE');
      case 'P2001':
      case 'P2025':
        return new NotFoundError('리소스를 찾을 수 없습니다.');
      case 'P2003':
        // 생성·수정 중 잘못된 외래 키를 전달한 일반적인 상황을 기준으로 매핑합니다.
        // 부모 삭제 충돌처럼 작업 맥락이 다르면 Service에서 409로 바꿀 수 있습니다.
        return new BadRequestError('참조 대상이 존재하지 않습니다.', 'INVALID_REFERENCE');
      case 'P2014':
        return new ConflictError(
          '연관된 리소스로 인해 작업을 수행할 수 없습니다.',
          'RELATION_CONFLICT',
        );
      case 'P2024':
        // 커넥션 풀에서 제한 시간 안에 연결을 얻지 못한 경우입니다.
        return new ServiceUnavailableError();
      default:
        return new InternalServerError('DATABASE_ERROR');
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new ServiceUnavailableError();
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    // 잘못 구성한 쿼리는 서버 코드 문제이므로 상세 검증 메시지를 숨깁니다.
    return new InternalServerError();
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return new InternalServerError('DATABASE_ERROR');
  }

  return new InternalServerError();
}

export type HttpErrorResult = {
  statusCode: number;
  body: ReturnType<typeof toErrorResponseBody>;
};

/**
 * 프레임워크 전역 오류 핸들러에서 사용할 수 있는 HTTP 오류 결과를 만듭니다.
 *
 * 실제 Fastify나 Express 코드에서는 원본 error를 서버 로그에 기록한 뒤,
 * 이 함수가 만든 안전한 상태 코드와 본문만 클라이언트에 전달합니다.
 */
export function toHttpErrorResult(error: unknown): HttpErrorResult {
  const appError = mapPrismaError(error);

  return {
    statusCode: appError.statusCode,
    body: toErrorResponseBody(appError),
  };
}
