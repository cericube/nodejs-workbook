import { prisma } from '../shared/database';

/**
 * 1) select와 include 비교
 *
 * select는 반환할 스칼라 필드와 관계 필드를 직접 선택합니다. include는 모델의
 * 기본 스칼라 필드를 유지하면서 관계 데이터를 추가할 때 사용합니다.
 */
async function runSelectAndInclude(email: string) {
  console.log('--- [1] select와 include 비교 ---');

  const selectedUser = await prisma.user.findUnique({
    where: {
      email,
    },
    // User와 posts 양쪽에서 필요한 필드만 선택하므로 반환 형태가 작아집니다.
    select: {
      id: true,
      displayName: true,
      posts: {
        select: {
          id: true,
          title: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 3,
      },
    },
  });

  const includedUser = await prisma.user.findUnique({
    where: {
      email,
    },
    // include를 사용하면 User의 모든 스칼라 필드에 posts가 추가됩니다.
    // 관계 내부에서는 다시 select를 사용해 Post 필드를 제한할 수 있습니다.
    include: {
      posts: {
        select: {
          id: true,
          title: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 3,
      },
    },
  });

  console.dir({ selectedUser, includedUser }, { depth: null });
  return { selectedUser, includedUser };
}

/**
 * select와 include 예제 실행 진입점
 */
async function main(): Promise<void> {
  await runSelectAndInclude('cericube1@create-example.local');
}

main()
  .catch((error: unknown) => {
    console.error('select/include 예제 실행 중 오류가 발생했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
