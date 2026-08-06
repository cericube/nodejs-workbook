import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// dotenv/config는 모듈을 불러오는 즉시 현재 실행 디렉터리의 .env를 읽습니다.
// .env 파일에 정의된 DATABASE_URL 값을 읽어옵니다.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

// Prisma에 전달할 Better SQLite3 어댑터 인스턴스를 생성합니다.
// file: 상대 경로는 Node.js 프로세스의 현재 실행 디렉터리를 기준으로 해석됩니다.
const adapter = new PrismaBetterSqlite3({
  url: connectionString,
});

// Prisma Client를 생성하여 애플리케이션에서 재사용할 수 있도록 내보냅니다.
// 테스트 종료 시 tests/setup.ts에서 $disconnect()를 호출해 연결을 정리합니다.
export const prisma = new PrismaClient({
  adapter,
});
