export enum ErrorCode {
  // =========================
  // COMMON / SYSTEM
  // =========================
  UNKNOWN = 'UNKNOWN',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',

  // =========================
  // VALIDATION / INPUT
  // =========================
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // =========================
  // AUTHENTICATION / AUTHORIZATION
  // =========================
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',

  // // =========================
  // // USER
  // // =========================
  // USER_NOT_FOUND = 'USER_NOT_FOUND',
  // EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',

  // // =========================
  // // SESSION
  // // =========================
  // SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  // SESSION_EXPIRED = 'SESSION_EXPIRED',

  // // =========================
  // // POST
  // // =========================
  // POST_NOT_FOUND = 'POST_NOT_FOUND',
  // POST_FORBIDDEN = 'POST_FORBIDDEN',

  // // =========================
  // // POST LIKE
  // // =========================
  // POST_ALREADY_LIKED = 'POST_ALREADY_LIKED',
  // POST_NOT_LIKED = 'POST_NOT_LIKED',

  // =========================
  // DATABASE / PERSISTENCE
  // =========================
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
}
