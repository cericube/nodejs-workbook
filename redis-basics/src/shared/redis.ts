import 'dotenv/config';
import { createClient } from 'redis';

// 환경 변수에서 Redis 연결 URL을 읽어옵니다.
const redisUrl = process.env.REDIS_URL;

// REDIS_URL이 정의되어 있지 않으면 애플리케이션 실행을 중단합니다.
if (!redisUrl) {
  throw new Error('REDIS_URL is not defined');
}

// URL을 사용하여 Redis 서버에 연결할 Client를 생성합니다.
export const redis = createClient({
  url: redisUrl,
});

// Redis Client에서 발생하는 오류를 콘솔에 출력합니다.
redis.on('error', (error) => {
  console.error('[Redis Error]', error);
});

/**
 * Redis 연결이 닫혀 있을 때만 새 연결을 맺습니다.
 *
 * @returns 연결된 Redis Client입니다.
 */
export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }

  return redis;
}

/**
 * 열려 있는 Redis 연결에 QUIT 명령을 보내 정상적으로 종료합니다.
 * 이미 연결이 닫혀 있으면 아무 작업도 하지 않습니다.
 */
export async function disconnectRedis() {
  if (redis.isOpen) {
    await redis.quit();
  }
}
