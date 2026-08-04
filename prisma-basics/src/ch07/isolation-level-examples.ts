import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../shared/database';

const INITIAL_DISPLAY_NAME = '격리 수준 초기 이름';
const UPDATED_DISPLAY_NAME = '외부 트랜잭션 변경 이름';

/**
 * 두 트랜잭션의 실행 순서를 관찰하기 위한 짧은 예제용 지연입니다.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지정한 격리 수준에서 같은 User를 두 번 읽는 내부 실험 함수입니다.
 *
 * 첫 번째 읽기와 두 번째 읽기 사이에 외부 쿼리가 displayName을 변경하고
 * 커밋합니다. 반환된 두 값으로 격리 수준의 데이터 가시성을 비교할 수 있습니다.
 */
async function runIsolationExperiment(
  email: string,
  isolationLevel: Prisma.TransactionIsolationLevel,
) {
  // 반복 실행할 수 있도록 User가 있으면 초기 이름으로 되돌리고 없으면 생성합니다.
  await prisma.user.upsert({
    where: { email },
    update: { displayName: INITIAL_DISPLAY_NAME },
    create: {
      email,
      displayName: INITIAL_DISPLAY_NAME,
    },
  });

  // reader는 하나의 트랜잭션에서 같은 SELECT를 두 번 실행합니다.
  // 두 SELECT가 보는 값의 차이가 아래 isolationLevel에 따라 달라집니다.
  const readerTransaction = prisma.$transaction(
    async (tx) => {
      const firstRead = await tx.user.findUniqueOrThrow({
        where: { email },
      });

      // writer가 값을 변경하고 커밋한 뒤 두 번째 SELECT가 실행되도록 기다립니다.
      await delay(100);

      const secondRead = await tx.user.findUniqueOrThrow({
        where: { email },
      });

      return { firstRead, secondRead };
    },
    { isolationLevel },
  );

  const writerTransaction = (async () => {
    // reader의 첫 번째 SELECT가 먼저 실행될 시간을 확보합니다.
    // 이 지연은 격리 수준을 설명하기 위한 예제용 순서 제어이며 운영 동기화 수단이 아닙니다.
    await delay(25);
    return prisma.user.update({
      where: { email },
      data: { displayName: UPDATED_DISPLAY_NAME },
    });
  })();

  const [reads, committedUser] = await Promise.all([readerTransaction, writerTransaction]);

  // committedUser는 writer가 실제 DB에 반영한 값이고, firstRead와 secondRead는
  // reader 트랜잭션이 각 시점에 관찰한 값을 나타냅니다.
  const result = { ...reads, committedUser };
  console.dir(result, { depth: null });
  return result;
}

/**
 * 1) ReadCommitted: 쿼리마다 새로 커밋된 값 확인
 *
 * PostgreSQL의 기본 격리 수준입니다. 외부 트랜잭션이 중간에 커밋하면
 * 같은 트랜잭션의 두 번째 SELECT에서 변경된 값을 볼 수 있습니다.
 */
export function runReadCommitted(email: string) {
  console.log('--- [1] ReadCommitted 격리 수준 ---');
  return runIsolationExperiment(email, Prisma.TransactionIsolationLevel.ReadCommitted);
}

/**
 * 2) RepeatableRead: 트랜잭션의 읽기 스냅샷 유지
 *
 * 외부 트랜잭션이 값을 변경하고 커밋해도 현재 트랜잭션의 두 번째 SELECT는
 * 첫 번째 SELECT와 같은 스냅샷의 값을 읽습니다.
 */
export function runRepeatableRead(email: string) {
  console.log('--- [2] RepeatableRead 격리 수준 ---');
  return runIsolationExperiment(email, Prisma.TransactionIsolationLevel.RepeatableRead);
}
