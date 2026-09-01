import { Type } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';

// User, Post, PostAttachment처럼 자동 증가하는 Prisma 기본 키를 사용하는
// 여러 라우트에서 같은 검증 조건을 반복하지 않도록 공통 스키마로 분리합니다.
export const IdParamsSchema = Type.Object(
  {
    // Fastify의 Ajv는 경로 문자열 "1"을 숫자 1로 변환한 뒤 검증합니다.
    // 0과 음수는 자동 증가 기본 키로 사용하지 않으므로 minimum을 1로 제한합니다.
    id: Type.Integer({ minimum: 1 }),
  },
  // id 이외의 예상하지 않은 경로 파라미터를 허용하지 않습니다.
  { additionalProperties: false },
);

// Static을 사용하면 JSON Schema와 별도로 인터페이스를 중복 선언할 필요가 없습니다.
export type IdParams = Static<typeof IdParamsSchema>;
