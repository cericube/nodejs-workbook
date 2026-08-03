import { prisma } from '../shared/database';

const EXAMPLE_EMAIL_DOMAIN = '@ch04-example.local';

/**
 * 1) 1:N nested create
 *
 * User를 만들면서 여러 Post를 같은 nested write에서 생성합니다. 생성된 User의
 * id는 각 Post의 authorId에 자동으로 저장됩니다.
 */
async function runNestedCreate(email: string) {
  console.log('--- [1] User.create + posts.create 실행 ---');

  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'ch04 nested create 사용자',
      posts: {
        create: [
          {
            title: 'nested create 게시글 1',
            content: 'User와 함께 생성한 공개 게시글입니다.',
            published: true,
          },
          {
            title: 'nested create 게시글 2',
            content: null,
          },
        ],
      },
    },
    include: {
      posts: true,
    },
  });

  console.dir(user, { depth: null });
  return user;
}

/**
 * 2) create와 connect 혼합
 *
 * 새 Post를 생성하면서 기존 User를 작성자로 연결합니다. connect의 where에는
 * id나 email처럼 대상 User를 고유하게 식별하는 필드가 필요합니다.
 */
async function runCreateWithConnect(authorEmail: string) {
  console.log('--- [2] Post.create + author.connect 실행 ---');

  const post = await prisma.post.create({
    data: {
      title: '기존 작성자와 연결한 게시글',
      content: 'connect를 사용해 기존 User를 연결했습니다.',
      published: true,
      author: {
        connect: {
          email: authorEmail,
        },
      },
    },
    include: {
      author: true,
    },
  });

  console.dir(post, { depth: null });
  return post;
}

/**
 * 3) connectOrCreate
 *
 * email에 해당하는 User가 있으면 연결하고 없으면 생성한 뒤 새 Post의 작성자로
 * 연결합니다. 기존 User가 있으면 create 블록은 실행되지 않으며 수정도 하지 않습니다.
 */
async function runConnectOrCreate(authorEmail: string) {
  console.log('--- [3] Post.create + author.connectOrCreate 실행 ---');

  const post = await prisma.post.create({
    data: {
      title: 'connectOrCreate 게시글',
      content: '작성자를 찾거나 생성해 연결했습니다.',
      author: {
        connectOrCreate: {
          // where에는 User.email처럼 unique 제약이 있는 필드를 사용합니다.
          where: {
            email: authorEmail,
          },
          create: {
            email: authorEmail,
            displayName: 'connectOrCreate 사용자',
          },
        },
      },
    },
    include: {
      author: true,
    },
  });

  console.dir(post, { depth: null });
  return post;
}

/**
 * 4) 명시적 다대다 중간 모델 생성
 *
 * PostLike는 User와 Post 사이의 관계 자체를 레코드로 저장합니다. 두 관계를
 * connect로 지정하며, 복합 기본 키가 같은 User의 중복 좋아요를 방지합니다.
 */
async function runCreatePostLike(userId: number, postId: number) {
  console.log('--- [4] PostLike.create 실행 ---');

  const postLike = await prisma.postLike.create({
    data: {
      user: {
        connect: {
          id: userId,
        },
      },
      post: {
        connect: {
          id: postId,
        },
      },
    },
    include: {
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
 * 관계 생성 예제 실행 진입점
 *
 * 실행 시각을 이메일에 포함해 반복 실행해도 email unique 충돌이 발생하지
 * 않게 합니다. 각 함수의 반환값을 다음 관계 생성 단계에 전달합니다.
 */
async function main(): Promise<void> {
  const runId = Date.now();
  const nestedUserEmail = `nested-${runId}${EXAMPLE_EMAIL_DOMAIN}`;
  const connectedUserEmail = `connected-${runId}${EXAMPLE_EMAIL_DOMAIN}`;

  const user = await runNestedCreate(nestedUserEmail);
  await runCreateWithConnect(user.email);

  const post = await runConnectOrCreate(connectedUserEmail);
  await runCreatePostLike(user.id, post.id);
}

main()
  .catch((error: unknown) => {
    console.error('관계 생성 예제 실행 중 오류가 발생했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
