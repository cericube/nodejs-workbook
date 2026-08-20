// /src/config/env.ts

import 'dotenv/config';
import process from 'node:process';

// PORT는 숫자로 변환한 뒤 서버가 사용할 수 있는 범위인지 확인합니다.
const port = Number(process.env.PORT ?? 3_000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT는 1부터 65535 사이의 정수여야 합니다.');
}

// 환경 변수를 한곳에 모아 애플리케이션의 공통 설정으로 제공합니다.
export const env = {
  // 데이터베이스 연결 문자열이 없으면 빈 문자열을 사용합니다.
  DATABASE_URL: process.env.DATABASE_URL ?? '',

  // 서버 바인딩 주소, 포트를 설정합니다.
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: port,
  // 로그에서 여러 서비스를 구분할 때 사용할 이름입니다.
  SERVICE_NAME: process.env.SERVICE_NAME ?? 'fastify-service',

  // 실행 환경을 지정하지 않으면 운영 환경으로 처리합니다.
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'error',
  LOG_PATH: process.env.LOG_PATH ?? './logs/app.log',
};
