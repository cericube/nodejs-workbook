import { prisma } from '../shared/database';

const EXAMPLE_EMAIL_DOMAIN = '@create-example.local';

/**
 * 1) delete: Post 한 건 삭제
 *
 * delete의 where에는 @id 또는 @unique 필드처럼 레코드 한 건을 식별할 수
 * 있는 조건이 필요합니다. 대상 Post가 없으면 P2025 오류가 발생합니다.
 */
export async function runDelete(postId: number) {
  console.log('--- [1] Post.delete 실행 ---');

  const post = await prisma.post.delete({
    // Post.id는 @id 필드이므로 단일 삭제 조건으로 사용할 수 있습니다.
    where: {
      id: postId,
    },
    // delete는 삭제된 레코드를 반환합니다. select를 사용하면 삭제 결과에서
    // 확인할 필드와 관계 데이터만 선택할 수 있습니다.
    select: {
      id: true,
      title: true,
      authorId: true,
      author: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      _count: {
        // onDelete: Cascade가 설정된 PostLike 관계의 삭제되는 수를 확인하기 위해 _count를 포함합니다.
        select: {
          likes: true,
        },
      },
    },
  });

  // PostLike.post 관계에 onDelete: Cascade가 설정되어 있으므로
  // Post가 삭제될 때 이 Post에 연결된 좋아요도 DB에서 함께 삭제됩니다.
  console.dir(post, { depth: null });
  return post;
}

/**
 * 2) delete: 복합 고유 키로 PostLike 한 건 삭제
 *
 * PostLike에는 단일 id가 없으며 (userId, postId)가 복합 기본 키입니다.
 * 두 필드의 조합으로 좋아요 한 건을 식별하며, 대상이 없으면 예외가 발생합니다.
 */
export async function runDeletePostLike(userId: number, postId: number) {
  console.log('--- [2] PostLike.delete 실행 ---');

  const postLike = await prisma.postLike.delete({
    // @@id([userId, postId])에서 생성된 userId_postId 조건을 사용합니다.
    where: {
      userId_postId: {
        userId,
        postId,
      },
    },
    // 삭제된 좋아요와 연결되어 있던 User와 Post 정보를 함께 반환합니다.
    select: {
      userId: true,
      postId: true,
      createdAt: true,
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
 * 3) deleteMany: 특정 User의 좋아요 여러 건 삭제
 *
 * deleteMany는 조건에 맞는 레코드를 모두 삭제하고 { count }를 반환합니다.
 * 대상이 없어도 예외가 발생하지 않으며 count가 0인 결과를 반환합니다.
 */
export async function runDeleteMany(userId: number) {
  console.log('--- [3] PostLike.deleteMany 실행 ---');

  const result = await prisma.postLike.deleteMany({
    // where를 생략하면 모든 PostLike가 삭제될 수 있으므로 삭제 범위를
    // 반드시 의도한 조건으로 제한해야 합니다.
    where: {
      userId,
    },
  });

  console.log(result); // { count: number }
  return result;
}

/**
 * 4) deleteMany + cascade: 이 예제에서 만든 데이터 정리
 *
 * 예제 전용 이메일 도메인의 User만 삭제합니다. User를 참조하는 Post와
 * PostLike는 스키마의 onDelete: Cascade에 따라 함께 삭제됩니다.
 */
export async function cleanUpExampleData(
  emailDomain = EXAMPLE_EMAIL_DOMAIN,
) {
  const result = await prisma.user.deleteMany({
    // 전체 User를 삭제하지 않도록 예제 전용 이메일 도메인으로 제한합니다.
    where: {
      email: {
        endsWith: emailDomain,
      },
    },
  });

  console.log('삭제된 예제 User 수:', result.count);
  return result;
}
