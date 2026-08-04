import { prisma } from '../shared/database';

/**
 * 1) 배열 기반 트랜잭션: 독립적인 User 두 건 함께 생성
 *
 * 두 create 작업은 서로의 결과를 사용하지 않으므로 배열 기반 $transaction에
 * 적합합니다. 두 작업이 모두 성공해야 생성 결과가 데이터베이스에 반영됩니다.
 */
export async function runBatchCreateUsers(firstEmail: string, secondEmail: string) {
  console.log('--- [1] 배열 기반 트랜잭션 User 생성 ---');

  // 배열에는 실행 전 상태의 PrismaPromise를 전달합니다. Prisma는 배열 순서대로
  // 같은 트랜잭션에서 실행하고 결과도 동일한 순서의 튜플로 반환합니다.
  const [firstUser, secondUser] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: firstEmail,
        displayName: '첫 번째 트랜잭션 사용자',
      },
    }),
    prisma.user.create({
      data: {
        email: secondEmail,
        displayName: '두 번째 트랜잭션 사용자',
      },
    }),
  ]);

  // $transaction Promise가 정상적으로 완료된 시점에는 두 INSERT가 모두
  // 커밋된 상태이므로 반환 객체의 id를 후속 작업에서 사용할 수 있습니다.
  const result = { firstUser, secondUser };
  console.log(result);
  return result;
}

/**
 * 2) 배열 기반 트랜잭션 롤백: email 고유 제약 위반
 *
 * User.email은 @unique 필드이므로 같은 이메일의 두 번째 create에서 P2002가
 * 발생합니다. 첫 번째 create까지 함께 롤백되는 원자성을 확인하는 예제입니다.
 */
export async function runBatchRollbackByDuplicateEmail(email: string) {
  console.log('--- [2] 배열 기반 트랜잭션 롤백 ---');

  // 오류를 이 함수에서 삼키지 않고 호출한 곳으로 전달해야 실패 여부와
  // 롤백 결과를 호출자가 확인할 수 있습니다.
  // 배열 기반 방식은 첫 번째 결과를 두 번째 data에 전달할 수 없다는 제약이 있습니다.
  return prisma.$transaction([
    prisma.user.create({
      data: {
        email,
        displayName: '롤백 대상 사용자 1',
      },
    }),
    prisma.user.create({
      data: {
        email,
        displayName: '롤백 대상 사용자 2',
      },
    }),
  ]);
}
