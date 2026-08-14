import axios from 'axios';

// Axios 테스트에서 Base URL과 공통 Header를 반복하지 않도록 전용 인스턴스를 만듭니다.
export const testAxios = axios.create({
  // 별도로 실행한 Fastify 실습 서버의 주소입니다.
  baseURL: 'http://localhost:3001',

  // 서버가 응답하지 않을 때 테스트가 무기한 대기하지 않도록 제한합니다.
  timeout: 5000,

  // 모든 Axios 요청에 공통으로 포함할 기본 Header입니다.
  headers: {
    'Content-Type': 'application/json',
    'X-Test-Client': 'Vitest',
  },
});
