// /tests/ch06/6-4.fastify.server.ts

import axios from 'axios';
import Fastify from 'fastify';

type ExternalUser = {
  id: string;
  name: string;
  email: string;
};

/**
 * Fastify 애플리케이션을 생성하는 팩토리 함수
 * - 테스트에서는 app.listen() 없이 app.inject()로 사용
 * - 운영 환경에서는 이 app을 listen 시켜 실제 서버로 사용
 */
export function createApp() {
  // 테스트 출력에 요청 객체나 Authorization 값이 노출되지 않도록 끕니다.
  const app = Fastify({ logger: false });

  /**
   * [API #1] 사용자 프로필 조회
   * GET /user-profile/:id
   *
   * 흐름:
   * 1. 클라이언트가 /user-profile/user_123 요청
   * 2. Fastify가 :id 값을 request.params에 담아줌
   * 3. 외부 사용자 API 호출 (axios)
   * 4. 외부 응답을 가공하여 클라이언트에 반환
   */
  app.get<{ Params: { id: string } }>('/user-profile/:id', async (request) => {
    // Route 제네릭을 지정했으므로 타입 단언 없이 id를 문자열로 사용할 수 있습니다.
    const rid = request.params.id;

    // 외부 API 호출
    // 테스트 환경에서는 이 요청을 MSW가 가로채서 가짜 응답을 반환
    const { data } = await axios.get<ExternalUser>(`https://api.external.com/users/${rid}`);

    // 외부 API 응답을 내부 API 규격에 맞게 변환하여 반환
    return {
      userId: data.id,
      displayName: data.name.toUpperCase(), // 비즈니스 로직: 대문자 변환
      email: data.email,
    };
  });

  /**
   * [API #2] 보호된 데이터 조회
   * GET /secure-data
   *
   * 흐름:
   * 1. 클라이언트가 Authorization 헤더와 함께 요청
   * 2. 해당 헤더를 그대로 외부 API로 전달
   * 3. 외부 API에서 인증 검증 후 응답 반환
   */
  app.get('/secure-data', async (request, reply) => {
    // Fastify는 모든 헤더를 소문자로 정규화해서 제공
    const authHeader = request.headers.authorization;

    // 요청에 인증 값이 있을 때만 외부 API의 Authorization Header를 만듭니다.
    const headers = authHeader ? { Authorization: authHeader } : {};

    // Axios 기본 동작은 4xx를 예외로 바꾸므로 모든 HTTP 상태를 응답으로 받게 합니다.
    const response = await axios.get('https://api.external.com/data', {
      headers,
      validateStatus: () => true,
    });

    // 외부 API의 상태 코드와 Body를 Fastify 클라이언트에 그대로 전달합니다.
    return reply.status(response.status).send(response.data);
  });

  // Fastify 인스턴스 반환
  // → 테스트에서는 app.inject()
  // → 운영에서는 app.listen()
  return app;
}
