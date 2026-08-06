import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// .env 파일에 정의된 DATABASE_URL 값을 읽어옵니다.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

// Prisma에 전달할 Better SQLite3 어댑터 인스턴스를 생성합니다.
const adapter = new PrismaBetterSqlite3({
  url: connectionString,
});

// Prisma Client를 생성하여 애플리케이션에서 재사용할 수 있도록 내보냅니다.
// 다른 모듈에서 import { prisma } from './lib/prisma' 형태로 사용합니다.
export const prisma = new PrismaClient({
  adapter,
});
