import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

import { ErrorCode } from './error.codes';

// 모든 오류 처리기와 라우트가 공통으로 사용하는 오류 응답 형식입니다.
export const ErrorResponseSchema = Type.Object(
  {
    success: Type.Literal(false),
    code: Type.Enum(ErrorCode),
    message: Type.String(),
  },
  { additionalProperties: false },
);

// 런타임 스키마에서 TypeScript 오류 응답 타입을 추출합니다.
export type ErrorResponse = Static<typeof ErrorResponseSchema>;
