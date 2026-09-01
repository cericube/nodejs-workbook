import { buildCh08App } from './app.js';

// 서버로 직접 실행할 때는 요청과 오류를 확인할 수 있도록 Fastify 로거를 활성화합니다.
const app = buildCh08App({ logger: true });

/** 지정한 호스트와 포트에서 Fastify 서버를 시작합니다. */
async function startServer() {
  // 127.0.0.1에 바인딩하므로 현재 컴퓨터에서만 예제 서버에 접속할 수 있습니다.
  const address = await app.listen({ host: '127.0.0.1', port: 3_000 });
  app.log.info({ address }, 'ch08 session authentication server started');
}

/** 종료 신호를 기록하고 Fastify가 관리하는 연결과 플러그인 리소스를 안전하게 정리합니다. */
async function shutdown(signal: string) {
  app.log.info({ signal }, 'server shutdown requested');
  await app.close();
}

// 이벤트 콜백에서 Promise를 기다리지 않는다는 의도를 void로 명확히 표시합니다.
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await startServer();
} catch (error) {
  // 시작 실패를 로그로 남기고 프로세스가 오류 종료 코드로 끝나도록 설정합니다.
  app.log.error(error, 'server failed to start');
  process.exitCode = 1;
}
