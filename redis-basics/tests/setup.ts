import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/shared/prisma';
import { connectRedis, disconnectRedis } from '../src/shared/redis';

// 각 테스트 전에 데이터베이스와 Redis 데이터를 초기화합니다.
beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.post.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const redis = await connectRedis();
  await redis.flushDb();
});

// 모든 테스트가 끝나면 데이터베이스와 Redis 연결을 종료합니다.
afterAll(async () => {
  await prisma.$disconnect();
  await disconnectRedis();
});
