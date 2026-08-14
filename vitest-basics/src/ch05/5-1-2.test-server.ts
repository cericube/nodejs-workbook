import Fastify from 'fastify';
import { testRoutes } from './5-1-1.test-routes';

// 외부 API 호출 실습에 사용할 Fastify 애플리케이션을 구성합니다.
// 인스턴스 생성과 listen()을 분리해 앱 구성을 독립적으로 확인할 수 있게 합니다.
export function createApp() {
  // 실제 요청과 응답 흐름을 터미널에서 확인할 수 있도록 Logger를 활성화합니다.
  const app = Fastify({
    logger: true,
  });

  // testRoutes의 모든 Route 앞에 /api prefix를 공통으로 붙입니다.
  app.register(testRoutes, {
    prefix: '/api',
  });

  return app;
}

const PORT = 3001;
const app = createApp();

// ch05 테스트를 실행하기 전에 이 서버를 별도 프로세스로 실행합니다.
// 테스트는 inject()가 아닌 실제 HTTP 연결을 통해 localhost:3001을 호출합니다.
app.listen({ port: PORT }, () => {
  console.log(`🚀 Test API Server running on http://localhost:${PORT}`);
});
