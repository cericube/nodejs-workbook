// details는 에러 종류마다 구조가 다르므로 any 대신 unknown으로 보관합니다.
// 소비자는 matcher나 타입 가드로 구조를 확인한 뒤 사용해야 합니다.

export class AppError extends Error {
  //public / private / protected / readonly가 붙은 생성자 파라미터
  // → 자동으로 클래스 필드 생성
  // 아무것도 안 붙은 파라미터
  // → 그냥 지역 변수 (constructor scope)

  constructor(
    // public readonly 매개변수 프로퍼티는 생성자 인자와 읽기 전용 필드를 동시에 선언합니다.
    public readonly statusCode: number,
    public readonly code: string,
    message: string, // 지역변수
    public readonly details?: unknown,
  ) {
    // Error 생성자에 전달하면 표준 message와 stack이 초기화됩니다.
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const idSuffix = id === undefined ? '' : ` ${id}`;
    super(404, 'NOT_FOUND', `${resource}${idSuffix}을(를) 찾을 수 없습니다`, {
      resource,
      id,
    });
    this.name = 'NotFoundError';
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = '인증이 필요합니다') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = '접근 권한이 없습니다') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = '서버 오류가 발생했습니다', details?: unknown) {
    super(500, 'INTERNAL_SERVER_ERROR', message, details);
    this.name = 'InternalServerError';
  }
}
