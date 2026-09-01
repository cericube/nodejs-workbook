import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

import { IdParamsSchema } from './common.schema';
import { UserStatus } from './user.types';

// 이메일의 최대 길이는 일반적으로 사용하는 최대 허용 범위인 254자로 제한합니다.
// format 검증은 문법만 확인하며 실제 이메일 소유 여부는 별도 인증이 필요합니다.
export const EmailSchema = Type.String({
  format: 'email',
  maxLength: 254,
});

// 영문자, 숫자와 허용된 특수문자를 각각 한 개 이상 포함해야 합니다.
const PASSWORD_PATTERN = '^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]+$';

// 비밀번호 길이와 허용 문자 규칙은 DB에 접근하기 전에 HTTP 경계에서 검사합니다.
export const PasswordSchema = Type.String({
  minLength: 10,
  maxLength: 64,
  pattern: PASSWORD_PATTERN,
});

// 회원가입 요청은 Prisma의 passwordHash가 아닌 사용자가 입력한 password를 받습니다.
export const RegisterUserBodySchema = Type.Object(
  {
    email: EmailSchema,
    // HTTP에서는 원문을 받고 서비스가 해시한 값만 Prisma에 전달합니다.
    password: PasswordSchema,
  },
  { additionalProperties: false },
);

// 로그인도 회원가입과 같은 이메일 및 비밀번호 규칙을 재사용합니다.
// 두 요청의 의미와 변경 방향이 다르기 때문에 별도의 스키마로 정의합니다.
export const LoginUserBodySchema = Type.Object(
  {
    email: EmailSchema,
    password: PasswordSchema,
  },
  { additionalProperties: false },
);

// 런타임 객체를 TypeBox 열거형 스키마로 변환하여 세 가지 상태 값만 허용합니다.
export const UserStatusSchema = Type.Enum(UserStatus);

// Prisma User에서 클라이언트에 공개해도 되는 필드만 응답 스키마에 포함합니다.
// passwordHash와 withdrawnAt 같은 내부 필드는 의도적으로 제외합니다.
export const UserResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    email: Type.String(),
    // Optional이 아니라 실제 JSON 값으로 null을 허용합니다.
    displayName: Type.Union([Type.String(), Type.Null()]),
    status: UserStatusSchema,
    // Date 객체가 JSON으로 직렬화된 ISO 8601 문자열 형태를 검사합니다.
    createdAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

// 읽기 응답 스키마는 기존 스키마에서 필요한 필드만 안전하게 파생할 수 있습니다.
export const UserSummarySchema = Type.Pick(UserResponseSchema, ['id', 'displayName', 'status']);

// 쓰기 요청은 수정 가능한 필드만 명시적으로 정의합니다.
export const UpdateUserProfileBodySchema = Type.Object(
  {
    // Optional은 필드 생략을, Null은 명시적인 값 제거를 의미합니다.
    // Ajv의 타입 변환이 null을 빈 문자열로 바꾸지 않도록 Null을 먼저 검사합니다.
    displayName: Type.Optional(Type.Union([Type.Null(), Type.String({ minLength: 1 })])),
  },
  // minProperties는 아무 변경 사항도 없는 빈 PATCH 요청을 거절합니다.
  { additionalProperties: false, minProperties: 1 },
);

// 같은 구조를 사용하되 라우트의 의미가 드러나는 이름으로 다시 내보냅니다.
export const UserIdParamsSchema = IdParamsSchema;

// 요청과 응답을 처리하는 컨트롤러와 서비스에서 사용할 타입입니다.
// 스키마가 변경되면 이 타입들도 자동으로 함께 변경됩니다.
export type RegisterUserBody = Static<typeof RegisterUserBodySchema>;
export type LoginUserBody = Static<typeof LoginUserBodySchema>;
export type UserResponse = Static<typeof UserResponseSchema>;
export type UserSummary = Static<typeof UserSummarySchema>;
export type UpdateUserProfileBody = Static<typeof UpdateUserProfileBodySchema>;
