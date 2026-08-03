import { prisma } from '../shared/database';

type PostCursor = {
  id: number;
  createdAt: string;
};

/**
 * 1) skip과 take를 이용한 오프셋 페이지네이션
 *
 * 특정 페이지로 바로 이동하기 쉽지만, 페이지 번호가 커질수록 DB가 많은
 * 레코드를 건너뛰어야 하므로 큰 데이터셋에서는 비용이 증가할 수 있습니다.
 */
async function getPostOffsetPage(page = 1, pageSize = 10) {
  console.log('--- [1] 오프셋 페이지네이션 ---');

  const currentPage = Math.max(1, Math.trunc(page));
  const take = Math.max(1, Math.trunc(pageSize));

  const posts = await prisma.post.findMany({
    where: {
      published: true,
    },
    // skip은 앞에서 건너뛸 레코드 수이고 take는 가져올 최대 개수입니다.
    skip: (currentPage - 1) * take,
    take,
    // 페이지 사이의 순서를 안정적으로 유지하도록 고유한 id를 보조 정렬합니다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
  });

  console.log(posts);
  return posts;
}

/**
 * 2) 복합 커서를 이용한 커서 페이지네이션
 *
 * schema.prisma의 @@unique([createdAt, id])로 생성된 createdAt_id 커서를
 * 사용합니다. take + 1건을 조회해 다음 페이지 존재 여부를 정확히 판단합니다.
 */
async function getPostCursorPage(cursor?: PostCursor) {
  console.log('--- [2] 커서 페이지네이션 ---');

  const pageSize = 3;

  const posts = await prisma.post.findMany({
    where: {
      published: true,
    },
    // 한 건을 더 조회하면 다음 페이지가 실제로 존재하는지 확인할 수 있습니다.
    take: pageSize + 1,
    // cursor가 있을 때만 기준 레코드와 skip 옵션을 쿼리에 추가합니다.
    ...(cursor && {
      cursor: {
        createdAt_id: {
          createdAt: new Date(cursor.createdAt),
          id: cursor.id,
        },
      },
      // 커서로 지정한 레코드 자체가 다시 포함되지 않도록 한 건 건너뜁니다.
      skip: 1,
    }),
    // 복합 커서 필드와 같은 순서로 정렬해야 페이지 이동이 일관됩니다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      title: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          displayName: true,
        },
      },
      _count: {
        select: {
          likes: true,
        },
      },
    },
  });

  const hasNextPage = posts.length > pageSize;
  const data = hasNextPage ? posts.slice(0, pageSize) : posts;
  const lastPost = data.at(-1);

  // Date는 API 응답에서 직접 전송할 수 있도록 ISO 문자열로 직렬화합니다.
  const nextCursor =
    hasNextPage && lastPost
      ? {
          id: lastPost.id,
          createdAt: lastPost.createdAt.toISOString(),
        }
      : null;

  return {
    data,
    nextCursor,
    hasNextPage,
  };
}

/**
 * 페이지네이션 예제 실행 진입점
 */
async function main(): Promise<void> {
  // await getPostOffsetPage(1, 10);

  const firstPage = await getPostCursorPage();
  console.dir(firstPage, { depth: null });

  if (firstPage.nextCursor) {
    const secondPage = await getPostCursorPage(firstPage.nextCursor);
    console.dir(secondPage, { depth: null });
  }
}

main()
  .catch((error: unknown) => {
    console.error('페이지네이션 예제 실행 중 오류가 발생했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
