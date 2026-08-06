import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/shared/prisma';
import { connectRedis, disconnectRedis } from '../src/shared/redis';

// 각 테스트가 이전 테스트의 데이터에 의존하지 않도록 저장소를 초기화합니다.
beforeEach(async () => {
  // 외래 키 제약 조건을 위반하지 않도록 자식 테이블부터 삭제합니다.
  await prisma.auditLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.post.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const redis = await connectRedis();
  // 테스트 전용 Redis DB의 모든 Key를 삭제합니다.
  // 운영 Redis와 같은 DB 번호를 사용하면 안 됩니다.
  await redis.flushDb();
});

// 모든 테스트가 끝나면 데이터베이스와 Redis 연결을 종료합니다.
afterAll(async () => {
  // 두 Client 모두 명시적으로 종료해 Vitest 프로세스에 열린 핸들이 남지 않게 합니다.
  await prisma.$disconnect();
  await disconnectRedis();
});
