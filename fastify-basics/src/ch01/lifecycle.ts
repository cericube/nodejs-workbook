/* eslint-disable @typescript-eslint/require-await */
// Fastify의 Promise 기반(async) 라이프사이클 훅을 살펴보는 예제입니다.

/**
 * Fastify 훅은 Promise 방식과 콜백 방식 중 하나로 작성할 수 있습니다.
 * 이 파일에서는 async 함수를 사용하는 Promise 방식을 사용합니다.
 *
 * async를 사용하지 않는 경우에는 아래처럼 done 콜백을 호출하여
 * 훅의 처리가 끝났음을 Fastify에 알려야 합니다.
 *
 * fastify.addHook('onRequest', (request, _reply, done) => {
 *   request.log.info('onRequest');
 *   done();
 * });
 *
 * async 함수와 done 콜백을 함께 사용하면 요청이 중복 처리될 수 있으므로
 * 두 방식을 혼용하지 않습니다.
 */

import Fastify from 'fastify';

// 1. 요청 로그를 기록하는 서버 인스턴스를 생성합니다.
const fastify = Fastify({
  logger: true,
});

fastify.addHook('onRequest', async (request, reply) => {
  void reply; //값을 실제로 사용하지 않고 의도적으로 무시한다는 의미
  request.log.info('1. onRequest: 요청을 받자마자 실행 (인증, CORS 등)');
});

fastify.addHook('preParsing', async (request, reply, payload) => {
  void reply;
  request.log.info('2. preParsing: 본문을 파싱하기 전');
  return payload;
});

fastify.addHook('preValidation', async (request, reply) => {
  void reply;
  request.log.info('3. preValidation: 요청이 유효성 검사되기 전');
});

fastify.addHook('preHandler', async (request, reply) => {
  void reply;
  request.log.info('4. preHandler: 핸들러 실행 전 (권한 검사 가능)');
});

fastify.get('/example', async (request) => {
  request.log.info('5. handler: 실제 API 로직(핸들러) 실행');
  return { message: '5. 핸들러 실행 완료' };
});

fastify.addHook('onSend', async (request, reply, payload) => {
  void reply;
  request.log.info('6. onSend: 응답을 보내기 직전 (응답 변조)');
  return payload;
});

fastify.addHook('onResponse', async (request, reply) => {
  void reply;
  request.log.info('7. onResponse: 응답이 클라이언트로 전송된 후');
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
