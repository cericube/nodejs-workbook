// 애플리케이션 실행 진입점: 서버 시작과 안전한 종료를 담당합니다.

import { createApp } from './app';
import { env } from './config/env';

async function startServer() {
  // 플러그인과 라우트 설정이 끝난 Fastify 인스턴스를 생성합니다.
  const app = createApp();

  // 여러 종료 신호가 연달아 들어와도 종료 절차는 한 번만 실행합니다.
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    // single thread 이므로 아래 코드는 동시성 문제를 걱정하지 않아도 됩니다.
    if (isShuttingDown) return;
    isShuttingDown = true;

    try {
      app.log.info(`Received ${signal}. Shutting down gracefully...`);

      // 새 요청 수신을 중단하고 처리 중인 요청이 끝난 뒤 연결을 닫습니다.
      await app.close();
      app.log.info('Server closed gracefully');
    } catch (error) {
      app.log.error({ err: error }, 'Error during shutdown');
    } finally {
      process.exit(1);
    }
  };

  // 이벤트 리스너는 Promise를 기다리지 않으므로, void로 의도적인 미대기를 표시합니다.
  // SIGINT: 터미널에서 Ctrl+C를 누를 때 주로 발생합니다.
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // SIGTERM: Docker, Kubernetes, PM2, systemd 등이 프로세스 종료를 요청할 때
  // 주로 사용합니다. 즉시 종료하지 않고 처리 중인 요청을 마무리합니다.
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // 처리되지 않은 Promise 거부는 예상하지 못한 오류이므로 기록한 뒤 종료 절차를 시작합니다.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled rejection');
    void shutdown('unhandledRejection');
  });

  try {
    // listen()이 성공하면 실제로 바인딩된 서버 주소를 반환합니다.
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    app.log.info(`Server listening at ${address}`);
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// 최상위 await로 startServer()의 초기 구동이 끝날 때까지 기다립니다.
await startServer();
