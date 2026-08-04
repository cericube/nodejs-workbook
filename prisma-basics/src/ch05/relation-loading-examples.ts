import { prisma } from '../shared/database';

// 현재 Prisma Client에서 relationLoadStrategy에 허용되는 두 값만 받습니다.
// 로컬 리터럴 유니온을 사용하면 generated 폴더를 제외한 ESLint 프로젝트에서도
// strategy를 error 타입이 아닌 명확한 문자열 타입으로 해석할 수 있습니다.
type RelationLoadStrategy = 'join' | 'query';

/**
 * 1) 현재 스키마에서 사용할 수 있는 기본 nested read
 *
 * include를 사용해 User와 관련 Post, PostLike를 한 번에 요청합니다. Prisma가
 * 관계 데이터의 조회와 결과 조합을 처리하므로 레코드별 반복 조회를 피할 수 있습니다.
 */
export async function runDefaultNestedRead() {
  console.log('--- [1] 기본 관계 로딩 ---');

  // 중첩 include는 관계를 단계별로 따라가며 결과 트리를 만듭니다.
  // 여기서는 User.posts와 각 Post.likes, 각 PostLike.user를 조회합니다.
  const users = await prisma.user.findMany({
    include: {
      posts: {
        where: {
          published: true,
        },
        include: {
          likes: {
            include: {
              user: true,
            },
          },
        },
      },
    },
  });

  console.dir(users, { depth: null });
  return users;
}

/**
 * 2) relationLoadStrategy로 join/query 전략 선택
 *
 * 같은 관계 조회에 전략만 다르게 전달해 반환 결과와 실행 특성을 비교합니다.
 * relationLoadStrategy는 최상위 쿼리에 작성하며 모든 중첩 관계에 적용됩니다.
 */
export async function loadUsersWithStrategy(strategy: RelationLoadStrategy) {
  // 두 전략의 실행 시간을 같은 기준으로 비교하기 위해 쿼리 직전에 측정을 시작합니다.
  // 이 값은 단일 실행 시간일 뿐이므로 실제 성능 판단에는 반복 측정이 필요합니다.
  const startedAt = performance.now();

  const users = await prisma.user.findMany({
    // join은 DB에서 관계 결과를 조합하고, query는 테이블별 쿼리 결과를
    // Prisma Client가 애플리케이션 레벨에서 조합합니다.
    relationLoadStrategy: strategy,
    select: {
      // 두 전략 모두 동일한 필드와 관계를 선택해야 결과와 실행 시간을
      // 같은 조건에서 비교할 수 있습니다.
      id: true,
      displayName: true,
      posts: {
        where: {
          published: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 3,
        select: {
          id: true,
          title: true,
          likes: {
            take: 5,
            select: {
              createdAt: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const elapsedMs = performance.now() - startedAt;

  console.log(`[${strategy}] User ${users.length}명 조회: ${elapsedMs.toFixed(2)}ms`);

  return users;
}

/**
 * 3) join과 query 전략을 같은 조건으로 비교
 *
 * 반환 데이터의 모양은 같지만 내부 관계 로딩 방식이 다릅니다. 한 번의 측정만으로
 * 성능을 단정하지 말고 실제 데이터와 쿼리 로그를 기준으로 여러 번 비교해야 합니다.
 */
export async function runRelationLoadStrategyComparison() {
  console.log('--- [3] relationLoadStrategy 비교 ---');

  // join은 PostgreSQL의 LATERAL JOIN과 JSON 집계를 사용해 관계 데이터를
  // 데이터베이스 쿼리 한 번으로 가져오는 기본 전략입니다.
  const joinResult = await loadUsersWithStrategy('join');

  // query는 모델별로 쿼리를 나누어 실행하고 Prisma Client에서 관계를 조합합니다.
  // PRISMA_QUERY_LOG=true로 설정하면 쿼리 로그에서 두 전략의 차이를 볼 수 있습니다.
  const queryResult = await loadUsersWithStrategy('query');

  return {
    joinResult,
    queryResult,
  };
}

/**
 * 4) in 필터를 이용한 명시적 배치 조회
 *
 * 반복문 안에서 User마다 Post를 조회하면 N+1 문제가 발생할 수 있습니다.
 * 먼저 User id 목록을 구한 다음 한 번의 Post 쿼리에 전달해 조회 횟수를 제한합니다.
 */
export async function runBatchedRelationRead() {
  console.log('--- [4] in 필터 기반 배치 조회 ---');

  const users = await prisma.user.findMany({
    // 첫 번째 쿼리는 관계 조합에 사용할 User 식별자와 표시 필드만 조회합니다.
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  });

  const userIds = users.map((user) => user.id);

  // 빈 배열을 in 조건에 전달해도 결과는 없지만, 불필요한 DB 요청 자체를
  // 피하기 위해 조회할 User가 없으면 즉시 반환합니다.
  if (userIds.length === 0) {
    return [];
  }

  const posts = await prisma.post.findMany({
    where: {
      authorId: {
        // in은 여러 authorId 중 하나와 일치하는 Post를 한 번에 조회합니다.
        // User별로 findMany를 반복하는 방식보다 DB 요청 횟수를 줄일 수 있습니다.
        in: userIds,
      },
      published: true,
    },
    select: {
      id: true,
      title: true,
      authorId: true,
      likes: {
        select: {
          createdAt: true,
          user: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  // 별도로 조회한 Post를 authorId 기준으로 묶어 User 트리 형태로 조합합니다.
  // Map을 사용하면 각 User를 처리할 때 전체 Post 배열을 반복 검색하지 않아도 됩니다.
  const postsByUserId = new Map<number, typeof posts>();

  for (const post of posts) {
    const userPosts = postsByUserId.get(post.authorId);

    if (userPosts) {
      userPosts.push(post);
    } else {
      postsByUserId.set(post.authorId, [post]);
    }
  }

  // Post가 없는 User도 누락하지 않고 빈 posts 배열을 갖도록 최종 결과를 만듭니다.
  const result = users.map((user) => ({
    ...user,
    posts: postsByUserId.get(user.id) ?? [],
  }));

  console.dir(result, { depth: null });
  return result;
}
