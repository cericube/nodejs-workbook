import { prisma } from '../shared/database';

/**
 * 1) Boolean과 Date 스칼라 필터
 *
 * 공개된 게시글 중 최근 30일 이내에 생성된 글을 조회합니다. 여러 필드를
 * where에 나란히 작성하면 기본적으로 AND 조건으로 결합됩니다.
 */
export async function runScalarFilters() {
  console.log('--- [1] Boolean과 Date 필터 ---');

  // Date.now()는 밀리초 단위이므로 30일을 밀리초로 환산해 기준 시각을 만듭니다.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // findMany는 where 조건을 만족하는 레코드를 배열로 반환합니다.
  const posts = await prisma.post.findMany({
    where: {
      // 같은 객체에 나열한 published와 createdAt 조건은 AND로 결합됩니다.
      published: true,
      // gte는 기준값 이상을 의미하므로 최근 30일의 게시글만 포함합니다.
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      // select에 true로 지정한 필드만 결과 객체에 포함됩니다.
      id: true,
      title: true,
      published: true,
      createdAt: true,
    },
    // 생성 시각이 같을 때 id를 두 번째 기준으로 사용해 순서를 고정합니다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    // 정렬된 결과 중 최대 10건만 가져옵니다.
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
export async function runStringFilters(keyword: string, emailDomain: string) {
  console.log('--- [2] 문자열 필터 ---');

  const posts = await prisma.post.findMany({
    where: {
      title: {
        // contains는 SQL의 LIKE/ILIKE와 같은 부분 문자열 검색에 해당합니다.
        contains: keyword,
        // PostgreSQL에서 insensitive는 영문 대소문자를 구분하지 않게 합니다.
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
export async function runNullFilters() {
  console.log('--- [3] null 필터 ---');

  const postsWithoutContent = await prisma.post.findMany({
    where: {
      // 빈 문자열('')과 null은 다릅니다. 여기서는 값이 없는 레코드만 찾습니다.
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
        // not: null은 실제 문자열 값이 저장된 레코드만 남깁니다.
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
export async function runLogicalFilters(keyword: string) {
  console.log('--- [4] 논리 조합 필터 ---');

  const posts = await prisma.post.findMany({
    where: {
      AND: [
        { published: true },
        {
          // OR 배열의 조건 중 하나라도 참이면 검색어 조건을 만족합니다.
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
