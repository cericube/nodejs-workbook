import { prisma } from '../shared/database';

/**
 * 1) User upsert: email에 따라 생성 또는 수정
 *
 * where 조건에 맞는 User가 있으면 update를 실행하고, 없으면 create를
 * 실행합니다. where에는 email처럼 고유한 필드만 사용할 수 있습니다.
 */
async function runUpsertUser(email: string) {
  console.log('--- [1] User.upsert 실행 ---');

  const user = await prisma.user.upsert({
    // email은 @unique 필드이므로 upsert의 조회 조건으로 사용할 수 있습니다.
    where: {
      email,
    },
    // 일치하는 User가 없을 때 실행됩니다.
    // create에는 새 User를 만드는 데 필요한 필드를 모두 전달해야 합니다.
    create: {
      email,
      displayName: 'upsert로 생성된 사용자',
    },
    // 일치하는 User가 있을 때 실행됩니다.
    // update에는 변경할 필드만 전달합니다.
    update: {
      displayName: 'upsert로 수정된 사용자',
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
    },
  });

  console.log(user);
  return user;
}

/**
 * 2) PostLike upsert: 복합 고유 키로 관계 존재 보장
 *
 * PostLike는 (userId, postId)가 복합 기본 키입니다. 좋아요가 없으면 새로
 * 만들고 이미 있으면 그대로 유지하는 멱등성 있는 관계 생성 예제입니다.
 */
async function runUpsertPostLike(userId: number, postId: number) {
  console.log('--- [2] PostLike.upsert 실행 ---');

  const postLike = await prisma.postLike.upsert({
    // 복합 키 조건의 이름은 Prisma가 필드명을 조합해 생성합니다.
    // 두 id에 해당하는 User와 Post가 없으면 create 단계에서 FK 오류가 발생합니다.
    where: {
      userId_postId: {
        userId,
        postId,
      },
    },
    create: {
      userId,
      postId,
    },
    // 이미 좋아요가 존재할 때 변경할 값이 없으므로 빈 update를 사용합니다.
    // 따라서 같은 입력으로 여러 번 실행해도 관계 레코드는 한 건만 유지됩니다.
    update: {},
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  console.dir(postLike, { depth: null });
  return postLike;
}

/**
 * upsert 예제 실행 진입점
 *
 * User 예제는 같은 email로 반복 실행하면 생성 분기와 수정 분기를 차례로
 * 확인할 수 있습니다. PostLike 예제는 실제 User와 Post의 id가 필요합니다.
 */
async function main(): Promise<void> {
  await runUpsertUser('upsert-example@create-example.local');

  // 실제 DB에 존재하는 User와 Post의 id를 전달합니다.
  await runUpsertPostLike(1, 1);
}

main()
  .catch((error: unknown) => {
    console.error('upsert 예제 실행 중 오류가 발생했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // shared/database는 별도 pool을 export하지 않으므로 Prisma만 종료합니다.
    await prisma.$disconnect();
  });
