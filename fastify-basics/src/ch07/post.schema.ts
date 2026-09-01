import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

import { IdParamsSchema } from './common.schema';

// 게시글 목록 API가 허용하는 필터, 페이지네이션과 정렬 조건입니다.
// Type.Optional은 쿼리 파라미터를 생략할 수 있다는 뜻입니다.
export const PostListQuerySchema = Type.Object(
  {
    // 특정 작성자의 게시글만 조회할 때 사용합니다.
    authorId: Type.Optional(Type.Integer({ minimum: 1 })),
    // URL의 "true"와 "false"는 Ajv가 boolean 값으로 변환합니다.
    published: Type.Optional(Type.Boolean()),
    // 제목이나 본문 검색에 사용할 문자열의 크기를 제한합니다.
    keyword: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    // 값이 생략되면 Fastify의 Ajv가 default 값을 요청 객체에 채웁니다.
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    // 정렬 가능한 Prisma 필드를 명시해 임의의 필드명이 전달되는 것을 막습니다.
    sortBy: Type.Optional(
      Type.Union([Type.Literal('title'), Type.Literal('createdAt'), Type.Literal('updatedAt')], {
        default: 'createdAt',
      }),
    ),
    // 정렬 방향도 asc와 desc 두 값으로 제한합니다.
    sortOrder: Type.Optional(
      Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'desc' }),
    ),
  },
  { additionalProperties: false },
);

// Prisma Post의 스칼라 필드를 JSON 응답 형태로 표현합니다.
export const PostResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    title: Type.String(),
    // Prisma의 content String?은 JSON 응답에서 문자열 또는 null입니다.
    content: Type.Union([Type.String(), Type.Null()]),
    published: Type.Boolean(),
    authorId: Type.Integer(),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

// 응답 스키마에서 자동 파생하지 않고 실제 수정 가능한 필드만 선언합니다.
export const UpdatePostBodySchema = Type.Object(
  {
    title: Type.Optional(Type.String({ minLength: 1 })),
    // Ajv의 타입 변환이 null을 빈 문자열로 바꾸지 않도록 Null을 먼저 검사합니다.
    content: Type.Optional(Type.Union([Type.Null(), Type.String()])),
    published: Type.Optional(Type.Boolean()),
  },
  // id, authorId, createdAt 같은 읽기 전용 필드는 additionalProperties로 거절합니다.
  // minProperties는 빈 PATCH 요청도 거절합니다.
  { additionalProperties: false, minProperties: 1 },
);

// 공통 ID 제약 조건을 게시글 라우트의 의미에 맞는 이름으로 재사용합니다.
export const PostIdParamsSchema = IdParamsSchema;

// 라우트 핸들러에서 별도 인터페이스 없이 사용할 수 있도록 타입을 추출합니다.
export type PostListQuery = Static<typeof PostListQuerySchema>;
export type PostResponse = Static<typeof PostResponseSchema>;
export type UpdatePostBody = Static<typeof UpdatePostBodySchema>;
