import { prisma } from '../shared/database';

/**
 * 1) include를 이용한 전체 관계 트리 조회
 *
 * User에서 posts, likes, user 순서로 관계를 따라가며 기본 필드를 모두
 * 조회합니다. 관계 구조를 빠르게 확인하기에는 편하지만 결과가 커질 수 있습니다.
 */
export async function runIncludeTree() {
  console.log('--- [1] include 관계 트리 조회 ---');

  // include는 User의 모든 스칼라 필드를 유지하면서 지정한 관계 필드를
  // 결과에 추가합니다. 관계 내부에도 where, orderBy, take를 적용할 수 있습니다.

  // 모든 User의 스칼라 필드 조회하면서,
  // 각 User가 작성한 최근 공개 게시글 3개,
  // 그리고 각 게시글의 최근 좋아요 5개와 좋아요를 누른 사용자 정보,
  // 마지막으로 게시글의 전체 좋아요 수까지 함께 가져옵니다.
  const users = await prisma.user.findMany({
    include: {
      // User가 작성한 공개 게시글 중 최근 3건만 포함합니다.
      posts: {
        where: {
          published: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 3,
        include: {
          // 각 Post의 좋아요와 좋아요를 누른 User까지 탐색합니다.
          likes: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
            include: {
              user: true,
            },
          },
          // likes 전체를 반환하는 것과 별개로 관계 개수도 함께 확인합니다.
          _count: {
            select: {
              likes: true,
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
 * 2) select를 이용한 관계 트리 정밀 조회
 *
 * 각 관계 단계에서 필요한 필드만 선택해 API 응답 모양과 데이터 크기를
 * 제어합니다. 선택하지 않은 email, content 등의 필드는 결과에 포함되지 않습니다.
 */
export async function runSelectTree() {
  console.log('--- [2] select 관계 트리 조회 ---');

  // select를 사용하면 true로 지정한 필드와 관계만 반환 타입에 포함됩니다.
  // API 응답처럼 필요한 데이터의 모양이 정해져 있을 때 유용합니다.

  // 모든 사용자의 일부 필드만 조회하면서,
  // 각 사용자의 최근 공개 게시글 3개,
  // 각 게시글의 전체 좋아요 수,
  // 그리고 최근 좋아요 5개의 사용자 정보를 가져옵니다.

  const users = await prisma.user.findMany({
    select: {
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
          createdAt: true,
          // 관계 레코드를 모두 가져올 필요가 없으면 _count만 선택할 수 있습니다.
          _count: {
            select: {
              likes: true,
            },
          },
          likes: {
            orderBy: {
              createdAt: 'desc',
            },
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

  console.dir(users, { depth: null });
  return users;
}

/**
 * 3) 서로 다른 관계 단계에서 select와 include 조합
 *
 * 같은 쿼리 단계에서는 select와 include를 동시에 사용할 수 없지만, 상위 User는
 * select하고 하위 posts에서는 include를 사용하는 것처럼 단계별 조합은 가능합니다.
 */
export async function runMixedTree() {
  console.log('--- [3] select + include 관계 트리 조회 ---');

  // select와 include는 같은 객체 단계에서 함께 사용할 수 없습니다.
  // 이 쿼리는 User 단계의 select 안에서 posts 관계를 선택한 뒤,
  // 한 단계 아래인 Post 쿼리에 include를 적용합니다.
  const users = await prisma.user.findMany({
    // 최상위 User에서는 외부에 노출할 필드만 선택합니다.
    select: {
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
        // Post는 기본 스칼라 필드를 유지하면서 likes 관계를 추가합니다.
        include: {
          likes: {
            take: 5,
            select: {
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

  console.dir(users, { depth: null });
  return users;
}
