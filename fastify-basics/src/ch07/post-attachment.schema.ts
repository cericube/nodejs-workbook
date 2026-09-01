import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

import { IdParamsSchema } from './common.schema';

// multipart 파일을 저장한 뒤 서비스 내부에서 구성할 메타데이터입니다.
// multipart/form-data 원본 요청을 직접 검증하는 스키마는 아닙니다.
export const PostAttachmentMetadataSchema = Type.Object(
  {
    // 사용자가 업로드한 원래 파일명으로, 화면 표시와 다운로드에 사용합니다.
    originalName: Type.String({ minLength: 1 }),
    // 클라이언트가 아니라 서버의 파일 저장 계층에서 생성해야 합니다.
    storageKey: Type.String({ minLength: 1 }),
    // Content-Type 응답 헤더와 허용 파일 형식 확인에 사용할 수 있습니다.
    mimeType: Type.String({ minLength: 1 }),
    // 파일 크기의 단위는 바이트이며, 빈 파일은 허용하지만 음수는 허용하지 않습니다.
    size: Type.Integer({ minimum: 0 }),
    // 첨부파일이 속할 Post의 양의 정수 기본 키입니다.
    postId: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

// storageKey는 내부 저장 위치이므로 공개 응답에서는 제외합니다.
// DB 저장 후 생성되는 id와 createdAt은 완료 응답에 포함합니다.
export const PostAttachmentResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    originalName: Type.String(),
    mimeType: Type.String(),
    size: Type.Integer(),
    createdAt: Type.String({ format: 'date-time' }),
    postId: Type.Integer(),
  },
  { additionalProperties: false },
);

// /post-attachments/:id에서 공통 양의 정수 ID 스키마를 재사용합니다.
export const PostAttachmentIdParamsSchema = IdParamsSchema;

// 파일 저장 서비스와 HTTP 컨트롤러에서 사용할 타입을 스키마에서 추출합니다.
export type PostAttachmentMetadata = Static<typeof PostAttachmentMetadataSchema>;
export type PostAttachmentResponse = Static<typeof PostAttachmentResponseSchema>;
