// Fastify 비동기 플러그인 타입을 사용하지만 현재 등록 과정에는 await가 없어 규칙을 비활성화합니다.
/* eslint-disable @typescript-eslint/require-await */

import { Type } from '@fastify/type-provider-typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';

import { ErrorCode } from '../common/errors/error.codes';
import { ErrorResponseSchema } from '../common/errors/error.schema';
import type { ErrorResponse } from '../common/errors/error.schema';
import {
  PostAttachmentIdParamsSchema,
  PostAttachmentMetadataSchema,
  PostAttachmentResponseSchema,
} from './post-attachment.schema';
import {
  PostIdParamsSchema,
  PostListQuerySchema,
  PostResponseSchema,
  UpdatePostBodySchema,
} from './post.schema';
import {
  LoginUserBodySchema,
  RegisterUserBodySchema,
  UpdateUserProfileBodySchema,
  UserIdParamsSchema,
  UserResponseSchema,
  UserSummarySchema,
} from './user.schema';
import { UserStatus } from './user.types';

// 실습 결과가 실행 시각에 따라 달라지지 않도록 고정된 ISO 8601 시간을 사용합니다.
const CREATED_AT = '2026-08-24T00:00:00.000Z';

// Prisma 조회 결과를 대신하는 사용자 예제 데이터입니다.
const exampleUser = {
  id: 1,
  email: 'fastify@example.com',
  displayName: null,
  status: UserStatus.ACTIVE,
  createdAt: CREATED_AT,
};

// Prisma 조회 결과를 대신하는 게시글 예제 데이터입니다.
const examplePost = {
  id: 1,
  title: 'TypeBox 스키마 패턴',
  content: null,
  published: true,
  authorId: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

// Prisma나 파일 저장소 없이 HTTP 경계의 검증과 직렬화만 연습하는 앱입니다.
export function buildCh07App() {
  const app = Fastify({
    // 테스트 출력에 불필요한 로그가 섞이지 않도록 비활성화합니다.
    logger: false,
    ajv: {
      customOptions: {
        // additionalProperties: false인 입력을 조용히 제거하지 않고 거절합니다.
        removeAdditional: false,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();
  // app 객체에 직접 작성한 라우트에서도 TypeBox 기반 타입 추론을 적용하기 위한 설정입니다.

  // 공통 오류 응답 구조가 실제 검증 오류에도 적용되는지 확인할 수 있습니다.
  app.setErrorHandler((error, _request, reply) => {
    // Fastify 검증 오류에는 validation 속성이 포함됩니다.
    const isValidationError = error instanceof Error && 'validation' in error;

    // 성공 라우트와 마찬가지로 오류 응답도 TypeBox에서 추출한 타입을 따릅니다.
    const response: ErrorResponse = {
      success: false,
      code: isValidationError ? ErrorCode.VALIDATION_ERROR : ErrorCode.INTERNAL_SERVER_ERROR,
      message: isValidationError
        ? '입력 형식이 올바르지 않습니다.'
        : '서버 내부 오류가 발생했습니다.',
    };

    return reply.status(isValidationError ? 400 : 500).send(response);
  });

  // 회원가입 요청 본문의 이메일과 비밀번호 형식 및 추가 필드를 검사합니다.
  app.post(
    '/users/register',
    {
      // 요청과 응답 스키마를 사용하는 라우트 바로 옆에 작성합니다.
      schema: {
        body: RegisterUserBodySchema,
        response: {
          200: UserResponseSchema,
          default: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // 실제 구현에서는 password를 해시하고 Prisma에는 passwordHash만 저장합니다.
      return reply.code(200).send({ ...exampleUser, id: 2, email: request.body.email });
    },
  );

  // 같은 PasswordSchema를 재사용하므로 로그인에도 동일한 입력 규칙이 적용됩니다.
  app.post(
    '/users/login',
    {
      schema: {
        body: LoginUserBodySchema,
        response: {
          200: Type.Object({ authenticated: Type.Literal(true) }),
          default: ErrorResponseSchema,
        },
      },
    },
    async () => {
      return { authenticated: true as const };
    },
  );

  // 응답 객체에 더 많은 값이 있어도 UserSummarySchema에 정의한 필드만 전송됩니다.
  app.get(
    '/users',
    {
      schema: {
        response: {
          200: Type.Array(UserSummarySchema),
          default: ErrorResponseSchema,
        },
      },
    },
    async () => {
      // UserSummarySchema가 email과 createdAt을 공개 응답에서 제외합니다.
      return [exampleUser];
    },
  );

  // 검증을 통과한 request.params.id는 string이 아닌 number로 추론됩니다.
  app.get(
    '/users/:id',
    {
      schema: {
        params: UserIdParamsSchema,
        response: {
          200: UserResponseSchema,
          default: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return { ...exampleUser, id: request.params.id };
    },
  );

  // displayName이 생략된 경우와 null로 전달된 경우를 구분해 연습할 수 있습니다.
  app.patch(
    '/users/:id',
    {
      schema: {
        params: UserIdParamsSchema,
        body: UpdateUserProfileBodySchema,
        response: {
          200: UserResponseSchema,
          default: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return {
        ...exampleUser,
        id: request.params.id,
        displayName: request.body.displayName ?? null,
      };
    },
  );

  // 쿼리 문자열이 TypeBox 스키마에 따라 변환된 뒤 핸들러로 전달됩니다.
  app.get(
    '/posts',
    {
      schema: {
        querystring: PostListQuerySchema,
        response: {
          200: Type.Array(PostResponseSchema),
          default: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      // query 값은 Fastify가 boolean과 number로 변환하고 기본값도 채웁니다.
      const { authorId, published, keyword } = request.query;
      const matches =
        (authorId === undefined || authorId === examplePost.authorId) &&
        (published === undefined || published === examplePost.published) &&
        (keyword === undefined || examplePost.title.includes(keyword));

      return matches ? [examplePost] : [];
    },
  );

  // 허용된 필드만 기존 게시글에 병합하는 PATCH 동작을 단순화한 예제입니다.
  app.patch(
    '/posts/:id',
    {
      schema: {
        params: PostIdParamsSchema,
        body: UpdatePostBodySchema,
        response: {
          200: PostResponseSchema,
          default: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      return { ...examplePost, ...request.body, id: request.params.id };
    },
  );

  // 응답 직렬화 과정에서 스키마에 없는 storageKey가 제거되는지 보여 주는 라우트입니다.
  app.get(
    '/post-attachments/:id',
    {
      schema: {
        params: PostAttachmentIdParamsSchema,
        response: {
          200: PostAttachmentResponseSchema,
          default: ErrorResponseSchema,
        },
      },
    },
    async (request) => ({
      id: request.params.id,
      originalName: 'guide.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      createdAt: CREATED_AT,
      postId: 1,
      // 응답 스키마에 없는 내부 저장 키는 직렬화 과정에서 제거됩니다.
      storageKey: 'posts/1/example.pdf',
    }),
  );

  // 실제 파일 업로드 대신 저장 완료 후의 메타데이터 기록 단계만 연습합니다.
  app.post(
    '/practice/post-attachments/metadata',
    {
      // 실제 공개 업로드 API에서는 storageKey를 클라이언트가 직접 보내게 하면 안 됩니다.
      // 이 라우트에서는 multipart 처리 후 만들어진 메타데이터 검증만 연습합니다.
      schema: {
        body: PostAttachmentMetadataSchema,
        response: {
          200: PostAttachmentResponseSchema,
          default: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // 실제 앱에서는 multipart 파일을 저장한 뒤 서비스가 이 값을 구성합니다.
      return reply.code(200).send({
        id: 1,
        originalName: request.body.originalName,
        mimeType: request.body.mimeType,
        size: request.body.size,
        createdAt: CREATED_AT,
        postId: request.body.postId,
      });
    },
  );

  return app;
}
