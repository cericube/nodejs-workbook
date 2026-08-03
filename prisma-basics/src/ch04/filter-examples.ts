import { prisma } from '../shared/database';

/**
 * 1) Boolean과 Date 스칼라 필터
 *
 * 공개된 게시글 중 최근 30일 이내에 생성된 글을 조회합니다. 여러 필드를
 * where에 나란히 작성하면 기본적으로 AND 조건으로 결합됩니다.
 */
async function runScalarFilters() {
  console.log('--- [1] Boolean과 Date 필터 ---');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      published: true,
      // gte는 기준값 이상을 의미하므로 최근 30일의 게시글만 포함합니다.
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      id: true,
      title: true,
      published: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 10,
  });

  console.log(posts);
  return posts;
}

/**
 * 2) 문자열 필터
 *
 * contains, startsWith, endsWith는 각각 포함·접두사·접미사를 검사합니다.
 * mode를 insensitive로 지정하면 영문 대소문자를 구분하지 않습니다.
 */
async function runStringFilters(keyword: string, emailDomain: string) {
  console.log('--- [2] 문자열 필터 ---');

  const posts = await prisma.post.findMany({
    where: {
      title: {
        contains: keyword,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      title: true,
    },
    orderBy: {
      title: 'asc',
    },
  });

  const users = await prisma.user.findMany({
    where: {
      email: {
        endsWith: emailDomain,
        mode: 'insensitive',
      },
      // in은 배열에 있는 값 중 하나와 일치하는지 검사합니다.
      displayName: {
        in: ['cericube1', 'cericube2', 'cericube3'],
      },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  });

  console.log({ posts, users });
  return { posts, users };
}

/**
 * 3) nullable 필드의 null 필터
 *
 * Post.content는 String?이므로 null 비교를 사용할 수 있습니다. null을 직접
 * 지정하면 본문이 없는 글을, not: null을 사용하면 본문이 있는 글을 찾습니다.
 */
async function runNullFilters() {
  console.log('--- [3] null 필터 ---');

  const postsWithoutContent = await prisma.post.findMany({
    where: {
      content: null,
    },
    select: {
      id: true,
      title: true,
      content: true,
    },
  });

  const postsWithContent = await prisma.post.findMany({
    where: {
      content: {
        not: null,
      },
    },
    select: {
      id: true,
      title: true,
      content: true,
    },
  });

  console.log({ postsWithoutContent, postsWithContent });
  return { postsWithoutContent, postsWithContent };
}

/**
 * 4) AND, OR, NOT 논리 필터
 *
 * 공개 상태이면서 제목이나 본문에 검색어가 포함되고, 제목에 제외 문자열이
 * 들어 있지 않은 게시글을 조회합니다.
 */
async function runLogicalFilters(keyword: string) {
  console.log('--- [4] 논리 조합 필터 ---');

  const posts = await prisma.post.findMany({
    where: {
      AND: [
        { published: true },
        {
          OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { content: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ],
      // NOT으로 감싼 조건에 해당하는 게시글은 결과에서 제외됩니다.
      NOT: {
        title: {
          contains: '[보관]',
          mode: 'insensitive',
        },
      },
    },
    select: {
      id: true,
      title: true,
      content: true,
      published: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  console.log(posts);
  return posts;
}

/**
 * 필터 예제 실행 진입점
 */
async function main(): Promise<void> {
  await runScalarFilters();

  // 필요한 필터 예제의 주석을 해제해 실행합니다.
  // await runStringFilters('create', '@create-example.local');
  // await runNullFilters();
  // await runLogicalFilters('Prisma');
}

main()
  .catch((error: unknown) => {
    console.error('필터 예제 실행 중 오류가 발생했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
