import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runTransactionTimeoutRollback,
  runTransactionWithOptions,
} from '../../src/ch07/transaction-options-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch07-options-test.local';

// 옵션 적용 트랜잭션에서 수정하고 Post 수를 셀 User의 PK입니다.
let authorId: number;

/**
 * 대화형 트랜잭션 옵션의 정상 실행과 timeout 초과 시 롤백을 검증합니다.
 */
describe('ch07 트랜잭션 고급 옵션', () => {
  /**
   * 정상 트랜잭션에서 User 수정과 Post count가 같은 범위에서 실행되는지 확인할
   * 작성자와 Post 두 건을 생성합니다.
   */
  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: '옵션 변경 전 이름',
        posts: {
          create: [{ title: '옵션 테스트 게시글 1' }, { title: '옵션 테스트 게시글 2' }],
        },
      },
    });
    authorId = author.id;
  });

  afterAll(async () => {
    // 정상 커밋 데이터와 timeout 테스트용 email을 같은 도메인 조건으로 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('지정한 옵션 안에서 User 수정과 Post 개수 조회를 커밋한다', async () => {
    const result = await runTransactionWithOptions(authorId, '옵션으로 변경한 이름');

    expect(result.user).toMatchObject({
      id: authorId,
      displayName: '옵션으로 변경한 이름',
    });
    // tx.post.count 결과가 준비한 관계 데이터 두 건과 일치해야 합니다.
    expect(result.postCount).toBe(2);
  });

  it('timeout 이후 쿼리가 실패하면 먼저 생성한 User도 롤백한다', async () => {
    const email = `timeout${EMAIL_DOMAIN}`;

    // 지연 시간을 timeout보다 충분히 길게 지정해 만료 동작을 의도적으로 발생시킵니다.
    await expect(runTransactionTimeoutRollback(email, 150, 25)).rejects.toMatchObject({
      code: 'P2028',
    });

    // P2028 전에 실행된 user.create도 커밋되지 않았는지 별도로 조회합니다.
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });
});
