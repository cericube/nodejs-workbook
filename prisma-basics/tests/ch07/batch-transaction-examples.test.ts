import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runBatchCreateUsers,
  runBatchRollbackByDuplicateEmail,
} from '../../src/ch07/batch-transaction-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch07-batch-test.local';

/**
 * 배열 기반 트랜잭션의 정상 커밋과 고유 제약 위반 시 전체 롤백을 검증합니다.
 */
describe('ch07 배열 기반 트랜잭션', () => {
  beforeAll(async () => {
    // 이전 테스트 실행이 남긴 전용 User만 삭제해 email 충돌을 방지합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    // 성공 테스트에서 커밋된 User를 제거하고 Prisma 연결을 종료합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('독립적인 User 두 건을 모두 커밋하고 배열 순서대로 반환한다', async () => {
    const firstEmail = `first${EMAIL_DOMAIN}`;
    const secondEmail = `second${EMAIL_DOMAIN}`;

    const result = await runBatchCreateUsers(firstEmail, secondEmail);
    // 반환값뿐 아니라 트랜잭션 커밋 후 실제 DB에 두 User가 있는지도 확인합니다.
    const users = await prisma.user.findMany({
      where: { email: { in: [firstEmail, secondEmail] } },
      orderBy: { email: 'asc' },
    });

    expect(result.firstUser.email).toBe(firstEmail);
    expect(result.secondUser.email).toBe(secondEmail);
    expect(users).toHaveLength(2);
  });

  it('두 번째 create의 P2002 오류가 첫 번째 create까지 롤백한다', async () => {
    const duplicateEmail = `duplicate${EMAIL_DOMAIN}`;

    // 알려진 Prisma 오류의 code를 검사해 의도한 unique 제약 위반인지 구분합니다.
    await expect(runBatchRollbackByDuplicateEmail(duplicateEmail)).rejects.toMatchObject({
      code: 'P2002',
    });

    // 첫 INSERT가 먼저 실행됐더라도 트랜잭션 전체가 롤백되어 남은 User가 없어야 합니다.
    const userCount = await prisma.user.count({
      where: { email: duplicateEmail },
    });
    expect(userCount).toBe(0);
  });
});
