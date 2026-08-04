import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../shared/database';

/**
 * 예제용 지연 함수입니다.
 * 실제 서비스에서는 트랜잭션 안에 의도적인 지연이나 외부 API 호출을 넣지 않습니다.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 1) maxWait, timeout과 isolationLevel을 지정한 대화형 트랜잭션
 *
 * User를 수정하고 같은 User의 Post 수를 한 트랜잭션에서 확인합니다.
 * 옵션 값은 예시이며 실제 서비스의 커넥션 풀과 쿼리 시간에 맞게 조정해야 합니다.
 */
export async function runTransactionWithOptions(userId: number, displayName: string) {
  console.log('--- [1] 대화형 트랜잭션 고급 옵션 ---');

  // 옵션 객체는 대화형 트랜잭션 콜백 다음의 두 번째 인자로 전달합니다.
  // 제한 시간을 과도하게 늘리면 DB 커넥션을 오래 점유할 수 있습니다.
  const result = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { displayName },
      });

      const postCount = await tx.post.count({
        where: { authorId: user.id },
      });

      return { user, postCount };
    },
    {
      // 트랜잭션을 시작할 커넥션을 얻기까지 기다리는 최대 시간입니다.
      maxWait: 2_000,
      // 콜백 안의 전체 작업이 완료돼야 하는 최대 시간입니다.
      timeout: 5_000,
      // PostgreSQL 기본 수준을 명시해 커밋된 데이터만 읽습니다.
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );

  console.log(result);
  return result;
}

/**
 * 2) timeout 초과 시 자동 롤백 확인
 *
 * 의도적으로 제한 시간보다 오래 기다린 뒤 추가 쿼리를 실행합니다. 트랜잭션이
 * 만료되어 오류가 발생하며 앞에서 생성한 User도 롤백됩니다.
 */
export async function runTransactionTimeoutRollback(email: string, delayMs = 100, timeoutMs = 50) {
  console.log('--- [2] 대화형 트랜잭션 timeout 롤백 ---');

  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          displayName: 'timeout 롤백 사용자',
        },
      });

      await delay(delayMs);

      // timeout 이후 쿼리를 실행하면 만료된 트랜잭션 오류가 발생합니다.
      // 오류가 콜백 밖으로 전달되므로 user.create도 함께 롤백됩니다.
      // Prisma에서는 이 상황이 P2028 같은 트랜잭션 오류로 전달될 수 있습니다.
      return tx.post.create({
        data: {
          title: 'timeout 이후 생성 시도',
          authorId: user.id,
        },
      });
    },
    {
      maxWait: 2_000,
      timeout: timeoutMs,
    },
  );
}
