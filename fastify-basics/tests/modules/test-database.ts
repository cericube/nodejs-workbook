import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from '../../src/generated/prisma/client';

/** 라우트 통합 테스트마다 독립적으로 사용할 인메모리 SQLite 클라이언트를 만듭니다. */
export function createTestPrisma(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: ':memory:' });
  return new PrismaClient({ adapter });
}

/** 인증·사용자 라우트가 사용하는 최소한의 테이블과 인덱스를 생성합니다. */
export async function createAuthSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "users" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "email" TEXT NOT NULL,
      "password_hash" TEXT NOT NULL,
      "display_name" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "role" TEXT NOT NULL DEFAULT 'USER',
      "withdrawn_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "users_email_key" ON "users"("email")');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "sessions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token_hash" TEXT NOT NULL,
      "expires_at" DATETIME NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "user_id" INTEGER NOT NULL,
      CONSTRAINT "sessions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id")',
  );
}

/** 테스트 사이에 인증 데이터를 제거해 각 테스트가 독립적으로 실행되게 합니다. */
export async function clearAuthData(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
