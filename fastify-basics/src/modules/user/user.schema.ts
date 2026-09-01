/**
 * 사용자 API의 요청·응답 스키마를 TypeBox로 정의합니다.
 * 입력값 검증, 응답 직렬화, API 명세에 사용하며 컨트롤러 DTO 타입의 기준도 제공합니다.
 */

import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error.schema';
import { UserRole, UserStatus } from './user.types';

// 애플리케이션의 사용자 상태 객체를 HTTP 요청·응답 검증용 열거형 스키마로 변환합니다.
export const UserStatusSchema = Type.Enum(UserStatus);
export const UserRoleSchema = Type.Enum(UserRole);

// 사용자 ID가 자동 증가하는 양의 정수인지 검사하는 공통 경로 파라미터입니다.
export const UserIdParamsSchema = Type.Object(
  {
    id: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

// 회원가입과 로그인에서 재사용하는 이메일 형식 및 최대 길이 규칙입니다.
export const EmailSchema = Type.String({
  format: 'email',
  maxLength: 254,
});

/**
 * 새 비밀번호의 문자 조합을 검사하는 정규식입니다.
 *
 * ^                       문자열의 시작
 * (?=.*[A-Za-z])          영문 대문자 또는 소문자를 한 개 이상 포함
 * (?=.*[0-9])             숫자를 한 개 이상 포함
 * (?=.*[!@#$%^&*])        !, @, #, $, %, ^, &, * 중 한 개 이상 포함
 * [A-Za-z0-9!@#$%^&*]+    전체 문자열에는 위 영문자, 숫자와 특수문자만 허용
 * $                       문자열의 끝
 *
 * (?=...)는 문자를 소비하지 않고 뒤의 문자열이 조건을 만족하는지만 확인하는
 * 긍정형 전방 탐색입니다. 공백과 허용 목록에 없는 특수문자는 거절됩니다.
 * 10~64자의 길이 제한은 정규식이 아니라 NewPasswordSchema에서 별도로 검사합니다.
 */
const NEW_PASSWORD_PATTERN = '^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]+$';

// 새 비밀번호에만 강도 규칙을 적용합니다.
export const NewPasswordSchema = Type.String({
  minLength: 10,
  maxLength: 64,
  pattern: NEW_PASSWORD_PATTERN,
});

// 현재 비밀번호는 과거 정책으로 생성됐을 수 있으므로 형식보다 입력 크기만 제한합니다.
export const CurrentPasswordSchema = Type.String({ minLength: 1, maxLength: 128 });

// 회원가입에서 받을 이메일, 원문 비밀번호, 선택 사항인 표시 이름의 형식을 제한합니다.
// role과 status는 클라이언트가 지정하지 못하도록 의도적으로 포함하지 않습니다.
export const RegisterUserBodySchema = Type.Object(
  {
    email: EmailSchema,
    password: NewPasswordSchema,
    displayName: Type.Optional(
      Type.Union([Type.Null(), Type.String({ minLength: 1, maxLength: 50 })]),
    ),
  },
  { additionalProperties: false },
);

// 현재 비밀번호와 강도 규칙을 만족하는 새 비밀번호를 받는 요청 형식입니다.
export const UpdateUserPasswordBodySchema = Type.Object(
  {
    currentPassword: CurrentPasswordSchema,
    newPassword: NewPasswordSchema,
  },
  { additionalProperties: false },
);

// WITHDRAWN 전환은 회원 탈퇴 기능에서 withdrawnAt 기록 및 세션 삭제와 함께 처리합니다.
export const UpdateUserStatusBodySchema = Type.Object(
  {
    status: Type.Union([Type.Literal(UserStatus.ACTIVE), Type.Literal(UserStatus.SUSPENDED)]),
  },
  { additionalProperties: false },
);

// 탈퇴 전 본인 확인을 위해 현재 비밀번호를 받는 요청 형식입니다.
export const WithdrawUserBodySchema = Type.Object(
  {
    currentPassword: CurrentPasswordSchema,
  },
  { additionalProperties: false },
);

// passwordHash는 어떤 사용자 응답에도 포함하지 않습니다.
export const UserResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    email: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    status: UserStatusSchema,
    role: UserRoleSchema,
    withdrawnAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

// 아래 라우트 스키마는 요청 스키마와 성공·공통 오류 응답 구조를 하나로 조합합니다.
// user.routes.ts는 이 객체를 Fastify의 schema 옵션에 전달합니다.
// default는 상태 코드와 관계없이 전역 오류 처리기가 만드는 공통 오류 응답을 직렬화합니다.
export const RegisterUserRouteSchema = {
  body: RegisterUserBodySchema,
  response: { 201: UserResponseSchema, default: ErrorResponseSchema },
} as const;

export const GetUserRouteSchema = {
  params: UserIdParamsSchema,
  response: { 200: UserResponseSchema, default: ErrorResponseSchema },
} as const;

export const UpdateUserPasswordRouteSchema = {
  params: UserIdParamsSchema,
  body: UpdateUserPasswordBodySchema,
  response: { 204: Type.Null(), default: ErrorResponseSchema },
} as const;

export const UpdateUserStatusRouteSchema = {
  params: UserIdParamsSchema,
  body: UpdateUserStatusBodySchema,
  response: { 200: UserResponseSchema, default: ErrorResponseSchema },
} as const;

export const WithdrawUserRouteSchema = {
  params: UserIdParamsSchema,
  body: WithdrawUserBodySchema,
  response: { 204: Type.Null(), default: ErrorResponseSchema },
} as const;

// 컨트롤러가 받을 입력과 반환할 응답 타입을 동일한 TypeBox 스키마에서 추출합니다.
export type UserIdParamsDto = Static<typeof UserIdParamsSchema>;
export type RegisterUserBodyDto = Static<typeof RegisterUserBodySchema>;
export type UpdateUserPasswordBodyDto = Static<typeof UpdateUserPasswordBodySchema>;
export type UpdateUserStatusBodyDto = Static<typeof UpdateUserStatusBodySchema>;
export type WithdrawUserBodyDto = Static<typeof WithdrawUserBodySchema>;
export type UserResponseDto = Static<typeof UserResponseSchema>;
