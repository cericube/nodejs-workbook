import { buildApp } from './app';

const PORT = 3000;

// app.ts에서 구성한 애플리케이션을 실제 포트에서 실행합니다.
async function startServer() {
  const app = buildApp();

  try {
    await app.listen({
      port: PORT,
    });

    app.log.info(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

await startServer();
