/** 인증 API의 요청·응답 구조와 TypeScript DTO 타입을 TypeBox로 정의합니다. */

import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error.schema';
import { CurrentPasswordSchema, EmailSchema, UserRoleSchema } from '../user/user.schema';

// 로그인 입력은 회원가입과 달리 비밀번호 강도보다 기존 비밀번호를 받을 수 있는 길이만 검사합니다.
export const LoginBodySchema = Type.Object(
  {
    email: EmailSchema,
    password: CurrentPasswordSchema,
  },
  { additionalProperties: false },
);

// 인증 응답에는 클라이언트가 현재 사용자를 식별하고 권한을 판단할 최소 정보만 포함합니다.
export const AuthUserSchema = Type.Object(
  {
    id: Type.Integer({ minimum: 1 }),
    email: Type.String({ format: 'email' }),
    role: UserRoleSchema,
  },
  { additionalProperties: false },
);

// 리프레시 토큰은 HttpOnly 쿠키로 전달하므로 JSON 응답 스키마에는 포함하지 않습니다.
export const AuthTokenResponseSchema = Type.Object(
  {
    accessToken: Type.String({ minLength: 1 }),
    tokenType: Type.Literal('Bearer'),
    expiresIn: Type.Integer({ minimum: 1 }),
    user: AuthUserSchema,
  },
  { additionalProperties: false },
);

// default 응답 스키마는 검증 오류와 비즈니스 오류에 공통 오류 구조를 적용합니다.
export const LoginRouteSchema = {
  body: LoginBodySchema,
  response: { 200: AuthTokenResponseSchema, default: ErrorResponseSchema },
} as const;

// 리프레시 토큰은 쿠키에서 읽기 때문에 별도의 요청 본문 스키마가 필요하지 않습니다.
export const RefreshRouteSchema = {
  response: { 200: AuthTokenResponseSchema, default: ErrorResponseSchema },
} as const;

// 204 응답은 성공 시 본문을 반환하지 않는다는 API 명세를 나타냅니다.
export const LogoutRouteSchema = {
  response: { 204: Type.Null(), default: ErrorResponseSchema },
} as const;

export const LogoutAllRouteSchema = {
  response: { 204: Type.Null(), default: ErrorResponseSchema },
} as const;

// 같은 스키마에서 TypeScript 타입을 생성해 런타임 검증 규칙과 컨트롤러 입력 타입을 맞춥니다.
export type LoginBodyDto = Static<typeof LoginBodySchema>;
export type AuthTokenResponseDto = Static<typeof AuthTokenResponseSchema>;
