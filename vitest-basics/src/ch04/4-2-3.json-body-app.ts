import type { FastifyInstance } from 'fastify';

/**
 * 게시글 도메인 모델 (예제용 In-Memory 타입)
 * 실제 서비스에서는 Prisma Model 또는 DTO로 대체됨
 */
interface Article {
  id: string;
  title: string;
  content: string;
  author: string;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
}

/**
 * DB 대신 사용하는 In-Memory 저장소
 * - 테스트 목적
 * - 서버 재시작 시 데이터 초기화됨
 */
const articles: Article[] = [];

/**
 * Fastify Route Plugin
 * - app.register(articleRoutes) 형태로 주입
 * - 모듈 단위 라우트 분리 구조의 기본 패턴
 */
export function articleRoutes(app: FastifyInstance) {
  /**
   * 게시글 생성 API 입력 스키마
   * - Fastify는 Ajv(JSON Schema) 기반 자동 검증 수행
   * - 검증 실패 시 400 Bad Request 자동 반환
   */
  const createArticleSchema = {
    body: {
      type: 'object',
      required: ['title', 'content', 'author'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 1 },
        author: { type: 'string', minLength: 1 },
        tags: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          default: [], // 값이 없으면 Ajv가 기본값 삽입 가능
        },
        publishedAt: { type: ['string', 'null'], format: 'date-time' },
      },
      additionalProperties: false, // 허용되지 않은 필드 차단
    },

    // /**
    //  * 응답 스키마
    //  * - Swagger / OpenAPI 생성 시 활용
    //  * - 실제로는 addSchema로 Article# 등록 후 $ref 사용
    //  */
    // response: {
    //   201: { $ref: 'Article#' },
    // },
  };

  /**
   * 게시글 수정 API 스키마 (PUT)
   * - body는 부분 필드 허용
   * - params는 URL Path 검증
   */
  const updateArticleSchema = {
    body: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 1 },
        tags: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
        },
      },
      additionalProperties: false,
    },
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1 },
      },
    },
  };

  /**
   * 게시글 생성 API
   * POST /api/articles
   */
  app.post<{
    Body: Omit<Article, 'id' | 'updatedAt'>;
  }>(
    '/api/articles',
    {
      schema: createArticleSchema,
    },
    (request, reply) => {
      /**
       * request.body 는 이미 JSON Schema 검증 완료 상태
       * → 타입 안정성 + 런타임 검증 동시에 확보
       */

      const newArticle: Article = {
        id: String(articles.length + 1), // 예제용 ID 생성
        ...request.body,
        tags: request.body.tags || [],
        publishedAt: request.body.publishedAt || null,
        updatedAt: new Date().toISOString(),
      };

      articles.push(newArticle);

      reply.code(201); // Created
      return newArticle;
    },
  );

  /**
   * 게시글 전체 수정 (PUT)
   * PUT /api/articles/:id
   */
  app.put<{
    Params: { id: string };
    Body: Partial<Pick<Article, 'title' | 'content' | 'tags'>>;
  }>(
    '/api/articles/:id',
    {
      schema: updateArticleSchema,
    },
    (request, reply) => {
      const { id } = request.params;

      /**
       * In-Memory DB에서 게시글 검색
       * 실제 서비스 → repository.findById()
       */
      const article = articles.find((a) => a.id === id);

      if (!article) {
        return reply.code(404).send({
          error: 'NotFound',
          message: '게시글을 찾을 수 없습니다',
        });
      }

      /**
       * 부분 업데이트 (undefined 체크)
       * → PATCH 의미와 유사하지만 PUT에서도 실무에서는 흔히 사용
       */
      if (request.body.title !== undefined) {
        article.title = request.body.title;
      }
      if (request.body.content !== undefined) {
        article.content = request.body.content;
      }
      if (request.body.tags !== undefined) {
        article.tags = request.body.tags;
      }

      article.updatedAt = new Date().toISOString();

      return article;
    },
  );

  /**
   * 게시글 발행 처리 (PATCH)
   * PATCH /api/articles/:id/publish
   *
   * - 특정 필드만 변경하는 명확한 use-case 기반 endpoint
   * - CQRS 스타일 API 설계 예시
   */
  app.patch<{
    Params: { id: string };
    Body: { publishedAt: string | null };
  }>('/api/articles/:id/publish', (request, reply) => {
    const { id } = request.params;
    const article = articles.find((a) => a.id === id);

    if (!article) {
      return reply.code(404).send({
        error: 'NotFound',
        message: '게시글을 찾을 수 없습니다',
      });
    }

    /**
     * 발행 시간 지정 or 즉시 발행
     */
    if (request.body.publishedAt === null) {
      article.publishedAt = null;
    } else if (!request.body.publishedAt) {
      article.publishedAt = new Date().toISOString();
    } else {
      article.publishedAt = request.body.publishedAt;
    }

    article.updatedAt = new Date().toISOString();

    return article;
  });
}

///////////////////////////////////////

import Fastify from 'fastify';

/**
 * 테스트 및 서버 실행용 App Builder
 * - Vitest에서는 이 함수로 app 생성 후 inject() 사용
 * - 실제 서버에서는 listen 전에 동일 함수 사용
 */
export function buildApp() {
  const app = Fastify({
    logger: false, // 테스트 시 불필요한 로그 제거
  });

  /**
   * 라우트 플러그인 등록
   * - prefix 옵션을 주면 /api 자동 적용 가능
   */
  app.register(articleRoutes);

  return app;
}
