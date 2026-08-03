import { prisma } from '../shared/database';

/**
 * 1) 1:N nested create
 *
 * User를 만들면서 여러 Post를 같은 nested write에서 생성합니다. 생성된 User의
 * id는 각 Post의 authorId에 자동으로 저장됩니다.
 */
export async function runNestedCreate(email: string) {
  console.log('--- [1] User.create + posts.create 실행 ---');

  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'ch04 nested create 사용자',
      posts: {
        // 배열의 각 객체로 Post를 만들고 새 User의 id를 authorId로 연결합니다.
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
      // 생성 결과에 함께 만들어진 Post 목록도 포함합니다.
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
export async function runCreateWithConnect(authorEmail: string) {
  console.log('--- [2] Post.create + author.connect 실행 ---');

  const post = await prisma.post.create({
    data: {
      title: '기존 작성자와 연결한 게시글',
      content: 'connect를 사용해 기존 User를 연결했습니다.',
      published: true,
      author: {
        // connect는 User를 새로 만들지 않고 unique email로 기존 행을 찾습니다.
        connect: {
          email: authorEmail,
        },
      },
    },
    include: {
      // 관계 연결 결과를 확인할 수 있도록 작성자 객체도 반환받습니다.
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
export async function runConnectOrCreate(authorEmail: string) {
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
            // where에서 User를 찾지 못했을 때만 이 데이터로 생성합니다.
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
export async function runCreatePostLike(userId: number, postId: number) {
  console.log('--- [4] PostLike.create 실행 ---');

  const postLike = await prisma.postLike.create({
    data: {
      // 중간 모델의 양쪽 관계를 각각 기존 레코드에 연결합니다.
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
      // 중간 레코드와 함께 연결된 User/Post의 일부 필드도 조회합니다.
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
