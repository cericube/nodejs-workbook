import { prisma } from '../shared/database';

/**
 * 1) nested write: User와 첫 Post를 원자적으로 생성
 *
 * 관계 데이터의 단순한 생성은 대화형 트랜잭션보다 중첩 쓰기가 간결합니다.
 * User 또는 Post 생성 중 하나라도 실패하면 전체 작업이 자동으로 롤백됩니다.
 */
export async function runNestedCreateUserWithPost(email: string, firstPostTitle: string) {
  console.log('--- [1] nested write User + Post 생성 ---');

  // 관계 필드인 posts를 User.create의 data 안에 작성하면 Prisma가
  // 부모 User와 자식 Post 생성을 하나의 원자적인 nested write로 처리합니다.
  const user = await prisma.user.create({
    data: {
      email,
      displayName: email.split('@')[0] || null,
      posts: {
        // 생성된 User의 id가 Post.authorId에 자동으로 연결되므로
        // 중첩된 Post data에는 authorId를 직접 전달하지 않습니다.
        create: {
          title: firstPostTitle,
          published: false,
        },
      },
    },
    // include는 저장 동작이 아니라 반환 결과에 생성된 Post를 추가합니다.
    include: {
      posts: true,
    },
  });

  console.dir(user, { depth: null });
  return user;
}

/**
 * 2) nested write: Post와 작성자의 첫 좋아요를 함께 생성
 *
 * PostLike는 User와 Post를 연결하는 명시적 다대다 모델입니다. 새 Post 생성과
 * 작성자의 좋아요 생성을 하나의 Prisma Client 호출로 원자적으로 처리합니다.
 */
export async function runNestedCreatePostWithInitialLike(authorId: number, title: string) {
  console.log('--- [2] nested write Post + PostLike 생성 ---');

  // author 연결이나 likes 생성 중 하나라도 실패하면 최상위 Post 생성도
  // 함께 롤백되어 관계가 불완전한 레코드가 남지 않습니다.
  const post = await prisma.post.create({
    data: {
      title,
      content: '트랜잭션과 중첩 쓰기 예제입니다.',
      published: true,
      author: {
        // connect는 새로운 User를 만들지 않고 기존 작성자를 연결합니다.
        connect: { id: authorId },
      },
      likes: {
        create: {
          user: {
            // 같은 User를 좋아요 관계에도 연결합니다.
            connect: { id: authorId },
          },
        },
      },
    },
    // 생성 결과에서 연결 상태를 바로 확인할 수 있도록 작성자와 좋아요를 포함합니다.
    include: {
      author: true,
      likes: true,
    },
  });

  console.dir(post, { depth: null });
  return post;
}
