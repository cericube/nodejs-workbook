import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

// Fastify의 기본 타입에 prisma 속성을 선언 병합으로 추가합니다.
declare module 'fastify' {
  interface FastifyInstance {
    // 라우트에서 fastify.prisma로 접근할 수 있도록 타입을 확장합니다.
    prisma: PrismaClient;
  }
}

// Fastify가 등록 과정에서 기다릴 수 있는 비동기 플러그인으로 정의합니다.
const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  // Prisma 7이 better-sqlite3를 통해 SQLite에 접근하도록 어댑터를 만듭니다.
  const adapter = new PrismaBetterSqlite3({
    url: env.DATABASE_URL,
    // 다른 쓰기 작업이 DB 잠금을 해제할 때까지 최대 5초간 기다립니다.
    timeout: 5_000,
  });

  // 현재 Fastify 애플리케이션에서 공유할 Prisma Client를 생성합니다.
  const prisma = new PrismaClient({
    adapter,
    // Prisma Client가 실행되는 동안 쿼리 로그를 파일에 출력합니다.
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // Prisma Client가 쿼리 로그를 발생시킬 때마다 debug 로그로 전달합니다.
  prisma.$on('query', (event) => {
    fastify.log.debug(
      {
        query: event.query,
        durationMs: event.duration,
        target: event.target,
      },
      'Prisma query',
    );
  });

  // Prisma Client가 정보 로그를 발생시킬 때마다 info 로그로 전달합니다.
  prisma.$on('info', (event) => {
    fastify.log.info(
      {
        target: event.target,
      },
      event.message,
    );
  });

  // Prisma Client가 경고 로그를 발생시킬 때마다 warn 로그로 전달합니다.
  prisma.$on('warn', (event) => {
    fastify.log.warn(
      {
        target: event.target,
      },
      event.message,
    );
  });

  // Prisma Client가 오류 로그를 발생시킬 때마다 error 로그로 전달합니다.
  prisma.$on('error', (event) => {
    fastify.log.error(
      {
        target: event.target,
      },
      event.message,
    );
  });

  // 플러그인 등록 단계에서 연결 가능 여부를 먼저 확인합니다.
  await prisma.$connect();

  // WAL 모드로 읽기와 쓰기가 서로를 막는 상황을 줄여 동시 처리 성능을 높입니다.
  // 이 설정은 SQLite 데이터베이스 파일에 저장되므로 최초 실행 이후에도 유지됩니다.
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');

  // Fastify 인스턴스에 공유 Prisma Client를 `prisma` 속성으로 추가하여,
  // 이후 등록되는 라우트와 플러그인에서 `fastify.prisma`로 사용할 수 있게 합니다.
  fastify.decorate('prisma', prisma);

  // app.close()가 호출되면 Prisma의 데이터베이스 연결을 정리합니다.
  // Fastify 서버가 종료될 때(fastify.close() 호출 시) 실행됩니다.
  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing Prisma connection...');
    await prisma.$disconnect();
  });
};

// 1. prismaPlugin: 데이터베이스 연결을 준비하는 실제 코드
// 2. import fp from 'fastify-plugin';
// fp(...): 준비된 Prisma를 다른 라우트와 플러그인에서도 사용할 수 있게 해주는 포장
// 3. name: 'prisma-plugin': Fastify가 이 플러그인을 구분할 때 사용하는 이름

// 이렇게 하면 다른 라우트와 플러그인에서도 준비된 Prisma를 공유해 사용할 수 있습니다.
export default fp(prismaPlugin, {
  // Fastify가 이 플러그인을 구분할 수 있도록 이름을 붙입니다.
  name: 'prisma-plugin',
});
