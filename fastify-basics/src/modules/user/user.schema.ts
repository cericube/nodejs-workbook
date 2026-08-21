// src/modules/user/user.schema.ts

// Fastify Type Provider가 다시 내보내는 TypeBox 빌더를 사용합니다.
import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error.schema';
import { UserStatus } from './user.types';

// user.types.ts의 공통 상태 값을 TypeBox 스키마로 변환하여 문자열 중복을 방지합니다.
// 이 스키마는 런타임 응답 직렬화와 API 문서의 허용 값 표현에 사용됩니다.
export const UserStatusSchema = Type.Enum(UserStatus);

// GET /users/:id의 경로 파라미터를 검증합니다.
export const UserIdParamsSchema = Type.Object(
  {
    // Prisma User의 id가 양의 정수이므로 같은 조건을 사용합니다.
    id: Type.Integer({ minimum: 1 }),
  },
  // id 외의 예상하지 않은 경로 파라미터는 허용하지 않습니다.
  { additionalProperties: false },
);

// 클라이언트에 공개할 사용자 정보만 응답 스키마에 포함합니다.
export const UserResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    email: Type.String(),
    // Prisma의 String? 필드는 문자열 또는 null이 될 수 있습니다.
    displayName: Type.Union([Type.String(), Type.Null()]),
    status: UserStatusSchema,
    // Date 객체는 HTTP 응답에서 ISO 문자열로 변환합니다.
    createdAt: Type.String(),
  },
  // 정의하지 않은 내부 필드가 실수로 응답에 포함되지 않게 합니다.
  { additionalProperties: false },
);

// Route가 사용할 경로 파라미터와 주요 응답 계약입니다.
// 요청 검증 실패에 대한 400 응답은 기존 전역 오류 처리기가 담당합니다.
export const GetUserRouteSchema = {
  params: UserIdParamsSchema,
  response: {
    // 정상 조회 결과는 공개 가능한 사용자 응답 형태로 직렬화합니다.
    200: UserResponseSchema,
    // 400, 404, 500 등 성공 응답 이외에는 공통 오류 응답 형식을 사용합니다.
    default: ErrorResponseSchema,
  },
} as const;

// Controller가 반환할 응답 타입도 같은 스키마에서 추출합니다.
export type UserResponseDto = Static<typeof UserResponseSchema>;
