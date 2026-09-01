// /src/config/env.ts

import 'dotenv/config';
import process from 'node:process';

// PORT는 숫자로 변환한 뒤 서버가 사용할 수 있는 범위인지 확인합니다.
const port = Number(process.env.PORT ?? 3_000);
const nodeEnv = process.env.NODE_ENV?.trim() ?? 'production';

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT는 1부터 65535 사이의 정수여야 합니다.');
}

function positiveInteger(name: string, value: string | undefined, defaultValue: number): number {
  const parsedValue = Number(value ?? defaultValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name}은 1 이상의 정수여야 합니다.`);
  }

  return parsedValue;
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
  NODE_ENV: nodeEnv,
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'error',
  LOG_PATH: process.env.LOG_PATH ?? './logs/app.log',

  // JWT 서명·검증에 함께 사용하는 비밀키이며 유출되면 공격자가 유효한 토큰을 만들 수 있습니다.
  // 소스 코드에 운영 비밀키를 넣지 말고 배포 환경의 비밀 저장소나 환경 변수로 주입해야 합니다.
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET?.trim() ??
    (nodeEnv === 'production' ? '' : 'local-development-jwt-secret-change-me'),
  // 액세스 JWT는 탈취 시 서버에서 개별 폐기하기 어려우므로 기본 수명을 15분으로 짧게 둡니다.
  AUTH_ACCESS_TOKEN_TTL_SECONDS: positiveInteger(
    'AUTH_ACCESS_TOKEN_TTL_SECONDS',
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    15 * 60,
  ),
  // 리프레시 세션과 HttpOnly 쿠키가 유지될 기간이며 기본값은 7일입니다.
  AUTH_REFRESH_TOKEN_TTL_SECONDS: positiveInteger(
    'AUTH_REFRESH_TOKEN_TTL_SECONDS',
    process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    7 * 24 * 60 * 60,
  ),
  // 브라우저와 서버가 리프레시 토큰을 주고받을 때 합의해 사용할 쿠키 이름입니다.
  AUTH_REFRESH_COOKIE_NAME: process.env.AUTH_REFRESH_COOKIE_NAME?.trim() || 'refreshToken',
};
