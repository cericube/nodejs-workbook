// src/app.ts

import Fastify from 'fastify';

import { env } from './config/env';
import { errorHandler } from './common/errors/error.handler';
import { notFoundHandler } from './common/errors/not-found.handler';

// 개발 환경: 설정된 로그 레벨 이상의 메시지만 보기 좋게 출력합니다.
const developmentLoggerOptions = {
  level: env.LOG_LEVEL,
  transport: {
    // JSON 로그를 개발자가 읽기 쉬운 형식으로 변환합니다.
    target: 'pino-pretty',
    options: {
      // 로그 시간을 현재 시스템의 표준 날짜·시간 형식으로 표시합니다.
      translateTime: 'SYS:standard',
      // 개발 중 중요도가 낮은 프로세스 ID와 호스트 이름은 숨깁니다.
      ignore: 'pid,hostname',
    },
  },
};

// 운영 환경: 설정된 로그 레벨 이상의 메시지를 JSON 형식으로 기록합니다.
const productionLoggerOptions = {
  level: env.LOG_LEVEL,
  transport: {
    // Pino의 파일 전송기를 사용합니다.
    target: 'pino/file',
    options: {
      // env.ts에서 읽은 LOG_PATH를 로그 파일 경로로 사용합니다.
      destination: env.LOG_PATH,
      // 로그 경로의 상위 디렉터리가 없으면 자동으로 생성합니다.
      mkdir: true,
    },
  },
};

// 실행 환경에 맞는 로거 설정을 선택합니다.
const loggerOptions =
  env.NODE_ENV === 'development' ? developmentLoggerOptions : productionLoggerOptions;

export function createApp() {
  const app = Fastify({
    logger: loggerOptions,

    // 요청 본문의 최대 크기를 1 MiB로 제한합니다.
    bodyLimit: 1024 * 1024,

    // 연결된 소켓에서 10초 동안 데이터 송수신이 없으면 타임아웃 처리합니다.
    // requestTimeout 만 사용해도 됨.
    connectionTimeout: 10_000,

    // 응답을 완료한 뒤 Keep-Alive 연결에서 다음 요청 데이터를 최대 5초간 기다립니다.
    keepAliveTimeout: 5_000,

    // 클라이언트로부터 HTTP 요청 전체를 수신하는 데 허용하는 최대 시간을 30초로 제한합니다.
    requestTimeout: 30_000,

    // 신뢰하는 리버스 프록시가 전달한 X-Forwarded-* 헤더를 사용합니다.
    trustProxy: true,

    // 플러그인이 10초 안에 로드되지 않으면 타임아웃 오류로 처리합니다.
    pluginTimeout: 10_000,

    routerOptions: {
      // /path와 /path/를 같은 라우트로 처리합니다.
      ignoreTrailingSlash: true,

      // URL 경로의 대소문자를 구분하지 않습니다.
      caseSensitive: false,

      // URL 경로 파라미터의 최대 길이를 200자로 제한합니다.
      maxParamLength: 200,
    },
  });

  // 요청 처리 중 발생한 비즈니스·검증·시스템 오류를 전역에서 처리하여
  // 일관된 HTTP 오류 응답으로 변환합니다.
  app.setErrorHandler(errorHandler);

  // 요청 URL과 일치하는 라우트가 없을 때 일관된 형식의 404 응답을 반환합니다.
  app.setNotFoundHandler(notFoundHandler);

  return app;
}
