/* eslint-disable @typescript-eslint/require-await */

import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import { join } from 'node:path';

import { userRoutes } from './routes/user.routes';
import helloPlugin from './plugins/hello.plugin';

// Fastify 애플리케이션의 설정과 라우트를 구성합니다.
export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino/file',
        options: {
          destination: join(process.cwd(), 'logs/app.log'),
          mkdir: true,
        },
      },
    },
  });

  // userRoutes에 포함된 모든 API 앞에 /users를 붙입니다.
  fastify.register(userRoutes, {
    prefix: '/users',
  });

  // 서버 상태를 확인할 API를 등록합니다.
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // helloPlugin을 서버에 등록합니다.
  // 이 플러그인은 fastify.sayHello 메서드와 request.timestamp 속성,
  // 그리고 요청 시각을 기록하는 onRequest 훅을 추가합니다.
  // 라우트보다 먼저 등록하여 아래의 /hello 라우트가 해당 기능을 사용하게 합니다.
  fastify.register(helloPlugin);

  // GET /hello 요청을 처리할 비동기 라우트 핸들러를 등록합니다.
  fastify.get('/hello', async (request) => {
    // 플러그인이 Fastify 인스턴스에 추가한 sayHello 메서드로 인사말을 만듭니다.
    const greeting = fastify.sayHello('Fastify');

    // helloPlugin의 onRequest 훅이 현재 요청 객체에 기록한 시작 시각을 읽습니다.
    const timestamp = request.timestamp;

    // 객체를 반환하면 Fastify가 JSON 응답으로 직렬화하여 클라이언트에 전송합니다.
    // 응답 예: { "greeting": "Hello, Fastify!", "timestamp": "2026-08-19T...Z" }
    return { greeting, timestamp };
  });

  // 처리되지 않은 오류를 애플리케이션의 공통 응답 형식으로 변환합니다.
  fastify.setErrorHandler((error, request, reply) => {
    // 서버 로그에는 원인을 확인할 수 있도록 실제 오류 정보를 기록합니다.
    request.log.error(error);

    const err = error as FastifyError;

    // JSON Schema 검증에 실패하면 400 응답을 반환합니다.
    if (err.validation) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: '입력값이 올바르지 않습니다.',
        details: err.validation,
      });
    }

    // 그 밖의 오류는 지정된 상태 코드 또는 기본값인 500으로 처리합니다.
    return reply.status(err.statusCode ?? 500).send({
      success: false,
      message: err.message || '서버 내부 오류가 발생했습니다.',
    });
  });

  return fastify;
}
