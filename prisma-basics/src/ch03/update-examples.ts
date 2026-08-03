import { prisma } from '../shared/database';

/**
 * 1) update + nested update: User와 연결된 Post를 함께 수정
 *
 * update의 where에는 @id 또는 @unique 필드처럼 레코드 한 건을 식별할 수
 * 있는 조건이 필요합니다. User 또는 연결된 Post가 없으면 예외가 발생합니다.
 */
async function runUpdate(userId: number, postId: number) {
  console.log('--- [1] User.update + posts.update 실행 ---');

  const user = await prisma.user.update({
    // User.id는 @id 필드이므로 단일 수정 조건으로 사용할 수 있습니다.
    where: {
      id: userId,
    },
    data: {
      displayName: '수정된 사용자 이름',
      posts: {
        // posts.update는 이 User에 연결된 Post 한 건을 함께 수정합니다.
        // postId가 존재해도 다른 User의 게시글이면 nested update에 실패합니다.
        update: {
          where: {
            id: postId,
          },
          data: {
            title: 'nested update로 수정한 제목',
            published: true,
          },
        },
      },
    },
    // select를 사용해 수정 결과에서 확인할 필드와 대상 Post만 반환합니다.
    select: {
      id: true,
      email: true,
      displayName: true,
      posts: {
        // 수정된 게시글 하나만 결과로 확인하려는 목적이므로 where 조건을 추가합니다.
        where: {
          id: postId,
        },
        select: {
          id: true,
          title: true,
          published: true,
          updatedAt: true,
        },
      },
    },
  });

  console.dir(user, { depth: null });
  return user;
}

/**
 * 2) updateMany: 조건에 맞는 Post 여러 건 수정
 *
 * 특정 User가 작성한 미공개 게시글을 모두 공개 상태로 변경합니다. 조건에
 * 맞는 게시글이 없어도 예외가 발생하지 않으며 수정된 건수만 반환합니다.
 */
async function runUpdateMany(userId: number) {
  console.log('--- [2] Post.updateMany 실행 ---');

  const result = await prisma.post.updateMany({
    // where는 수정할 레코드의 범위를 제한합니다.
    // where를 생략하면 모든 Post가 수정될 수 있으므로 일괄 수정 시 주의해야 합니다.
    where: {
      authorId: userId,
      published: false,
    },
    // data의 값이 조건을 만족하는 모든 Post에 동일하게 적용됩니다.
    data: {
      published: true,
    },
  });

  // updateMany는 수정된 Post 객체가 아니라 { count }를 반환합니다.
  console.log(result);
  return result;
}

/**
 * 3) updateManyAndReturn: 여러 Post를 수정하고 결과 반환
 *
 * updateMany와 달리 변경된 레코드 배열을 반환합니다. 수정 결과를 후속 처리에
 * 사용해야 할 때 유용하며, 반환량이 많아지지 않도록 조건과 select를 제한합니다.
 */
async function runUpdateManyAndReturn(userId: number) {
  console.log('--- [3] Post.updateManyAndReturn 실행 ---');

  const posts = await prisma.post.updateManyAndReturn({
    where: {
      authorId: userId,
    },
    data: {
      content: 'updateManyAndReturn으로 일괄 수정한 내용입니다.',
    },
    // select는 변경된 Post에서 필요한 필드만 반환합니다.
    // 현재 생성된 Prisma Client는 author 관계도 함께 선택할 수 있습니다.
    select: {
      id: true,
      title: true,
      content: true,
      updatedAt: true,
      author: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  console.dir(posts, { depth: null });
  return posts;
}

/**
 * update 예제 실행 진입점
 *
 * update 계열 함수는 기존 데이터를 변경하므로 실제 DB에 존재하는 User와
 * Post의 id를 확인한 뒤 필요한 호출만 주석 해제해 실행합니다.
 */
async function main(): Promise<void> {
  // Post는 반드시 userId에 해당하는 User가 작성한 게시글이어야 합니다.
  await runUpdate(1, 1);

  // 해당 User의 미공개 게시글을 모두 공개합니다.
  await runUpdateMany(1);

  // 해당 User의 모든 게시글 내용을 수정하고 변경된 목록을 반환합니다.
  await runUpdateManyAndReturn(1);

  console.log('실행할 update 예제의 주석을 해제해 주세요.');
}

main()
  .catch((error: unknown) => {
    console.error('update 예제 실행 중 오류가 발생했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // shared/database는 별도 pool을 export하지 않으므로 Prisma만 종료합니다.
    await prisma.$disconnect();
  });
