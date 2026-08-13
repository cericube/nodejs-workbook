import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * ============================
 * /search?q=xxx
 * Query String 처리 예제
 * ============================
 */
export function registerSearchRoute(app: FastifyInstance) {
  /**
   * 이 함수는 Fastify plugin 형태의 "라우트 묶음" 등록 함수입니다.
   * buildApp()에서 app.register(registerSearchRoute) 를 호출하면,
   * Fastify가 내부적으로 다음과 같이 실행합니다:
   *
   *   await registerSearchRoute(app)
   *
   * 즉, 여기서 전달받은 app 인스턴스에
   * 실제 HTTP 라우트를 추가하는 구조입니다.
   */

  app.route({
    method: 'GET', // HTTP 메서드
    url: '/search', // 최종 라우트 경로: GET /search

    /**
     * schema:
     *  - 요청/응답 구조를 JSON Schema로 정의
     *  - Fastify가 자동으로 validation 수행
     *  - 실패 시 handler까지 도달하지 않고 400 응답 반환
     */
    schema: {
      querystring: {
        type: 'object', // Fastify 5에서는 반드시 object 명시 필요
        properties: {
          q: { type: 'string' }, // ?q=검색어
        },
        required: ['q'], // q가 없으면 validation 에러
      },

      // 응답 형식도 정의 가능 (문서화 + 런타임 검증)
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'string' },
          },
        },
      },
    },

    /**
     * handler:
     *  - schema validation이 통과한 경우에만 실행됨
     *  - request에는 이미 검증된 값이 들어 있음
     */
    handler: (request: FastifyRequest, reply: FastifyReply) => {
      // TypeScript 타입은 자동 추론되지 않으므로 수동 캐스팅
      const query = request.query as { q: string };

      // reply.send() 또는 return 둘 다 가능
      return reply.send({ result: query.q });
    },
  });
}

/**
 * ============================
 * /users/:id
 * Path Parameter 처리 예제
 * ============================
 */
export function registerUsersRoute(app: FastifyInstance) {
  app.route({
    method: 'GET',
    url: '/users/:id', // :id 는 path parameter

    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'], // path param은 보통 필수
      },
    },

    handler: (request: FastifyRequest) => {
      const params = request.params as { id: string };
      return { id: params.id };
    },
  });
}

/**
 * ============================
 * /echo
 * Request Body(JSON) 처리 예제
 * ============================
 */
export function registerEchoRoute(app: FastifyInstance) {
  app.route({
    method: 'POST',
    url: '/echo',

    /**
     * body schema가 존재하면:
     *  - Content-Type: application/json 인 요청 본문을 자동 파싱
     *  - schema 기준으로 validation 수행
     */
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      },
    },

    handler: (request: FastifyRequest) => {
      const body = request.body as { name: string; age?: number };
      return body; // 그대로 echo 응답
    },
  });
}

/**
 * ============================
 * /whoami
 * Header 읽기 예제
 * ============================
 */
export function registerWhoamiRoute(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'], // 여러 HTTP 메서드 허용 가능
    url: '/whoami',

    handler: (request: FastifyRequest) => {
      // 모든 헤더는 소문자로 normalize 되어 있음
      const agent = request.headers['user-agent'] ?? 'unknown';
      return { userAgent: agent };
    },
  });
}

/**
 * ============================
 * /multi
 * query + body + header 조합 예제
 * ============================
 */
export function registerMultiInputRoute(app: FastifyInstance) {
  app.route({
    method: 'POST',
    url: '/multi',

    schema: {
      querystring: {
        type: 'object',
        properties: {
          verbose: { type: 'boolean' },
        },
      },
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
        },
      },
    },

    handler: (request: FastifyRequest) => {
      const { verbose } = request.query as { verbose?: boolean };
      const body = request.body as { title: string };

      return {
        message: verbose ? `Verbose: ${body.title}` : body.title,
      };
    },
  });
}

//////////////////////////////////////////////////////////////////////////////////

import Fastify from 'fastify';

/**
 * Fastify 애플리케이션 생성 함수
 *  - 테스트(Vitest inject)
 *  - 실제 서버 실행
 * 두 경우 모두 동일한 앱을 재사용하기 위한 패턴
 */
export function buildApp() {
  // Fastify 인스턴스 생성 (아직 서버 listen 전 상태)
  const app = Fastify();

  /**
   * app.register(fn)
   *
   * 의미:
   *  - fn을 Fastify plugin 으로 등록
   *  - Fastify가 초기화 단계에서 fn(app)을 호출
   *  - fn 내부에서 app.route() 들이 실제 라우트 테이블에 추가됨
   *
   * 즉, 아래 코드는 결국:
   *   registerSearchRoute(app)
   *   registerUsersRoute(app)
   *   ...
   * 와 동일한 효과를 가집니다.
   *
   * 단, register를 쓰면:
   *  - plugin 스코프 분리 가능
   *  - prefix, encapsulation, hook 분리 등 고급 구조 설계 가능
   */

  app.register(registerSearchRoute);
  app.register(registerUsersRoute);
  app.register(registerEchoRoute);
  app.register(registerWhoamiRoute);
  app.register(registerMultiInputRoute);

  // 테스트 코드나 server.ts에서 재사용 가능하도록 app 반환
  return app;
}
