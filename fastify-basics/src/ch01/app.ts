import Fastify from 'fastify';

// 1. 요청 로그를 기록하는 서버 인스턴스를 생성합니다.
const fastify = Fastify({
  logger: true,
});

// 2. GET /ping 요청을 처리하는 라우트를 등록합니다.
fastify.get('/ping', () => {
  // Fastify는 반환한 객체를 JSON 응답으로 자동 직렬화합니다.
  return { pong: true };
});

// 3. 3000번 포트에서 서버를 실행합니다.
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

await start();
