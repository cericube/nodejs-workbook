import { prisma } from '../shared/database';

/**
 * 1) select와 include 비교
 *
 * select는 반환할 스칼라 필드와 관계 필드를 직접 선택합니다. include는 모델의
 * 기본 스칼라 필드를 유지하면서 관계 데이터를 추가할 때 사용합니다.
 */
export async function runSelectAndInclude(email: string) {
  console.log('--- [1] select와 include 비교 ---');

  const selectedUser = await prisma.user.findUnique({
    where: {
      // findUnique의 where에는 @unique인 email이나 기본 키 id를 사용합니다.
      email,
    },
    // User와 posts 양쪽에서 필요한 필드만 선택하므로 반환 형태가 작아집니다.
    select: {
      id: true,
      displayName: true,
      posts: {
        // 관계 필드를 선택한 뒤 그 안에서도 반환 필드를 다시 제한할 수 있습니다.
        select: {
          id: true,
          title: true,
        },
        orderBy: {
          // 사용자별 게시글을 최신 생성 순서로 정렬합니다.
          createdAt: 'desc',
        },
        // 정렬 결과에서 최근 게시글 세 건만 포함합니다.
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
  // 사용자가 없으면 두 쿼리 결과는 모두 null입니다.
  return { selectedUser, includedUser };
}
