import { prisma } from '../shared/database';

export type PostCursor = {
  // 복합 커서를 JSON이나 URL에 전달할 수 있는 형태로 표현합니다.
  id: number;
  createdAt: string;
};

/**
 * 1) skip과 take를 이용한 오프셋 페이지네이션
 *
 * 특정 페이지로 바로 이동하기 쉽지만, 페이지 번호가 커질수록 DB가 많은
 * 레코드를 건너뛰어야 하므로 큰 데이터셋에서는 비용이 증가할 수 있습니다.
 */
export async function getPostOffsetPage(page = 1, pageSize = 10) {
  console.log('--- [1] 오프셋 페이지네이션 ---');

  // 소수점은 버리고 최솟값을 1로 제한해 잘못된 페이지 입력을 보정합니다.
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
      // 목록 화면에 필요한 필드만 반환해 전송량을 줄입니다.
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
export async function getPostCursorPage(cursor?: PostCursor) {
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
        // 스키마의 복합 unique 필드는 두 값을 모두 제공해야 한 행을 식별합니다.
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
        // 관계 필드도 중첩 select로 필요한 속성만 가져올 수 있습니다.
        select: {
          id: true,
          displayName: true,
        },
      },
      _count: {
        // 실제 Like 목록 대신 관계 레코드의 개수만 조회합니다.
        select: {
          likes: true,
        },
      },
    },
  });

  // 요청 크기보다 한 건 더 왔다면 뒤에 이어지는 페이지가 존재합니다.
  const hasNextPage = posts.length > pageSize;
  // 응답에는 미리 확인하기 위해 가져온 여분의 한 건을 제외합니다.
  const data = hasNextPage ? posts.slice(0, pageSize) : posts;
  // 현재 페이지의 마지막 레코드가 다음 조회의 시작 커서가 됩니다.
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
    // 클라이언트는 hasNextPage와 nextCursor로 다음 페이지 요청 여부를 결정합니다.
    data,
    nextCursor,
    hasNextPage,
  };
}
