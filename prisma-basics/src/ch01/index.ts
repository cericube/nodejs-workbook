import { prisma } from '../shared/database';

async function main(): Promise<void> {
  console.log('데이터 생성을 시작합니다...');

  // 고유한 이메일을 사용하여 User 데이터를 생성합니다.
  const created = await prisma.user.create({
    data: {
      email: `dev${Date.now()}@example.com`,
      displayName: 'Prisma Dev',

      // User와 Post를 하나의 nested write로 함께 생성합니다.
      posts: {
        create: {
          title: 'Prisma 첫 게시글',
          content: 'nested write로 생성한 게시글입니다.',
          published: true,
        },
      },
    },
    // 반환 결과에 연결된 Post 데이터도 포함합니다.
    include: { posts: true },
  });

  console.log('1) Created user:', created);
}

main()
  .catch((error: unknown) => {
    // 실행 중 발생한 오류를 출력합니다.
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // 프로세스가 끝나기 전에 데이터베이스 연결을 정리합니다.
    await prisma.$disconnect();
  });
