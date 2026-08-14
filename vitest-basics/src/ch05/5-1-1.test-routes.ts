import type { FastifyInstance } from 'fastify';

// Axios와 Undici가 실제 HTTP로 호출할 실습용 API Route를 등록합니다.
// 서버에서 /api prefix를 적용하므로 각 경로의 최종 URL은 /api/... 형태가 됩니다.
// Fastify의 async plugin 형태를 사용하지만 현재 등록 과정에는 await할 작업이 없습니다.
// eslint-disable-next-line @typescript-eslint/require-await
export async function testRoutes(app: FastifyInstance) {
  /**
   * GET + Query 테스트
   * GET /api/echo?message=hello
   */
  app.get('/echo', (request) => {
    // JSON Schema를 사용하지 않는 간단한 예제이므로 Query 타입을 직접 지정합니다.
    const { message } = request.query as {
      message?: string;
    };

    // Query가 생략된 경우에도 JSON 응답 형태를 유지하도록 null을 반환합니다.
    return {
      method: 'GET',
      message: message ?? null,
    };
  });

  /**
   * GET + Path Param 테스트
   * GET /api/users/:id
   */
  app.get('/users/:id', (request) => {
    // URL의 :id 구간은 request.params에서 문자열로 읽습니다.
    const { id } = request.params as {
      id: string;
    };

    // 클라이언트가 숫자 값으로 응답받을 수 있도록 id를 변환합니다.
    return {
      method: 'GET',
      userId: Number(id),
    };
  });

  /**
   * POST + Body 테스트
   * POST /api/users
   */
  app.post('/users', (request, reply) => {
    // Fastify가 application/json 요청 Body를 객체로 파싱한 결과입니다.
    const body = request.body as {
      name: string;
      age: number;
    };

    // 리소스 생성 성공을 나타내는 201 Created를 설정합니다.
    reply.code(201);

    return {
      method: 'POST',
      user: body,
    };
  });

  /**
   * Header 테스트 (Authorization)
   * GET /api/secure
   */
  app.get('/secure', (request, reply) => {
    // Node.js는 요청 Header 이름을 소문자로 정규화합니다.
    const auth = request.headers['authorization'];

    // 실습용 고정 Token이 없거나 일치하지 않으면 인증 실패로 처리합니다.
    if (!auth || auth !== 'Bearer test-token') {
      reply.code(401);
      return {
        message: 'Unauthorized',
      };
    }

    return {
      message: 'Authorized',
      token: auth,
    };
  });
}
