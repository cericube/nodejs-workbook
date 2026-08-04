/**
 * API 클라이언트에 전달할 수 있는 애플리케이션 오류 코드입니다.
 *
 * Prisma의 Pxxxx 코드를 그대로 노출하지 않고 서비스에서 의미 있는 코드로
 * 변환하면 데이터베이스 구현과 외부 응답 형식을 분리할 수 있습니다.
 */
export type AppErrorCode =
  | 'CONFLICT'
  | 'DUPLICATE_RESOURCE'
  | 'BAD_REQUEST'
  | 'INVALID_REFERENCE'
  | 'RESOURCE_NOT_FOUND'
  | 'RELATION_CONFLICT'
  | 'SERVICE_UNAVAILABLE'
  | 'DATABASE_ERROR'
  | 'INTERNAL_SERVER_ERROR';

/**
 * 애플리케이션에서 공통으로 사용하는 오류의 기본 클래스입니다.
 *
 * HTTP 상태와 공개 가능한 오류 코드를 함께 보관하되, Prisma의 원본 오류
 * 메시지나 DB 제약 조건 같은 내부 정보는 클라이언트 응답에 포함하지 않습니다.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly errorCode: AppErrorCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * 동일한 리소스가 이미 있거나 현재 상태와 충돌할 때 사용하는 409 오류입니다.
 */
export class ConflictError extends AppError {
  constructor(message: string, errorCode: AppErrorCode = 'CONFLICT') {
    super(message, 409, errorCode);
  }
}

/**
 * 요청 값이나 참조 값이 유효하지 않을 때 사용하는 400 오류입니다.
 */
export class BadRequestError extends AppError {
  constructor(message: string, errorCode: AppErrorCode = 'BAD_REQUEST') {
    super(message, 400, errorCode);
  }
}

/**
 * 반드시 있어야 하는 리소스를 찾지 못했을 때 사용하는 404 오류입니다.
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'RESOURCE_NOT_FOUND');
  }
}

/**
 * 데이터베이스 연결 문제처럼 일시적으로 요청을 처리할 수 없을 때 사용합니다.
 */
export class ServiceUnavailableError extends AppError {
  constructor() {
    super('일시적으로 서비스를 사용할 수 없습니다.', 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * 세부 원인을 외부에 공개하면 안 되는 예상 밖의 서버 오류입니다.
 */
export class InternalServerError extends AppError {
  constructor(errorCode: AppErrorCode = 'INTERNAL_SERVER_ERROR') {
    super('서버 오류가 발생했습니다.', 500, errorCode);
  }
}

export type ErrorResponseBody = {
  error: {
    code: AppErrorCode;
    message: string;
  };
};

/**
 * AppError를 모든 API에서 사용할 수 있는 고정된 응답 본문으로 변환합니다.
 */
export function toErrorResponseBody(error: AppError): ErrorResponseBody {
  return {
    error: {
      code: error.errorCode,
      message: error.message,
    },
  };
}
