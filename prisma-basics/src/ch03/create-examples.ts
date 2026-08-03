import type { User } from '../../generated/prisma/client';
import { prisma } from '../shared/database';

const EXAMPLE_EMAIL_DOMAIN = '@create-example.local';

/**
 * 1) create: User 한 건 생성
 *
 * select나 include가 없으면 User의 스칼라 필드가 모두 반환됩니다.
 */
export async function runCreate(
  email = `cericube1${EXAMPLE_EMAIL_DOMAIN}`,
): Promise<User> {
  console.log('--- [1] User.create 실행 ---');

  // prisma.user.create()
  // - User 테이블에 레코드 한 건을 생성합니다.
  // - 생성에 성공하면 새로 만들어진 User 객체를 반환합니다.
  // - email은 @unique 필드이므로 이미 존재하는 값이면 오류가 발생합니다.
  const user = await prisma.user.create({
    // data에는 생성할 모델의 필드 값을 전달합니다.
    // id, createdAt은 스키마에 기본값이 있으므로 생략할 수 있습니다.
    data: {
      email,
      displayName: 'cericube1',
    },
  });

  console.log(user);
  return user;
}

/**
 * 2) nested create: User와 Post를 한 번에 생성
 *
 * 관계 데이터까지 함께 생성해야 할 때 사용하는 대표적인 nested write입니다.
 * include를 사용하면 생성된 User와 Post를 한 결과로 받을 수 있습니다.
 */
export async function runNestedCreate(
  email = `cericube2${EXAMPLE_EMAIL_DOMAIN}`,
) {
  console.log('--- [2] User.create + posts.create 실행 ---');

  // 최상위 create는 User 한 건을 생성합니다.
  // data 내부에 relation 필드인 posts를 작성하면 관계 데이터도 같은
  // nested write 안에서 생성할 수 있습니다.
  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'cericube2',
      posts: {
        // posts.create 배열의 각 객체로 Post를 생성합니다.
        // 생성된 User의 id는 각 Post의 authorId로 자동 연결되므로
        // 여기에서 authorId를 직접 지정할 필요가 없습니다.
        create: [
          {
            title: 'nested create 게시글 1',
            content: 'User와 함께 생성한 게시글입니다.',
            published: true,
          },
          {
            title: 'nested create 게시글 2',
            content: '두 번째 게시글입니다.',
          },
        ],
      },
    },
    // include는 생성 결과에 relation 데이터도 포함시킵니다.
    // 생략하면 User만 반환되고 Post는 반환 객체에 포함되지 않습니다.
    include: {
      posts: true,
    },
  });

  console.dir(user, { depth: null });
  return user;
}

/**
 * 3) createManyAndReturn: User 여러 건을 생성하고 결과 반환
 *
 * createMany의 반환값은 { count }이지만 createManyAndReturn은 생성된
 * 레코드를 반환합니다. select로 필요한 필드만 받을 수 있습니다.
 */
export async function runCreateManyAndReturn(
  emails: readonly [string, string] = [
    `cericube3${EXAMPLE_EMAIL_DOMAIN}`,
    `cericube4${EXAMPLE_EMAIL_DOMAIN}`,
  ],
) {
  console.log('--- [3] User.createManyAndReturn 실행 ---');

  // createManyAndReturn은 data 배열의 레코드를 한 번에 생성하고,
  // 생성된 레코드 배열을 반환합니다.
  const users = await prisma.user.createManyAndReturn({
    data: [
      {
        email: emails[0],
        displayName: 'cericube3',
      },
      {
        email: emails[1],
        displayName: 'cericube4',
      },
    ],
    // unique 제약 조건과 충돌하는 레코드는 오류를 발생시키는 대신
    // 건너뜁니다. 이 예제에서는 email 중복에 적용됩니다.
    skipDuplicates: true,
    // select는 반환받을 필드를 제한합니다.
    // 불필요한 필드를 제외해 반환 데이터 크기를 줄일 수 있습니다.
    select: {
      id: true,
      email: true,
    },
  });

  console.log(users);
  return users;
}

/**
 * 4) create + connect: 기존 User와 연결된 Post 생성
 *
 * 외래 키인 authorId를 직접 입력하는 대신 relation 필드의 connect를
 * 사용하면 고유 조건으로 기존 레코드를 연결할 수 있습니다.
 */
export async function runCreateWithConnect(authorEmail: string) {
  console.log('--- [4] Post.create + author.connect 실행 ---');

  // Post 한 건을 생성하면서 기존 User를 작성자로 연결합니다.
  const post = await prisma.post.create({
    data: {
      title: 'connect로 작성자를 연결한 게시글',
      content: '기존 User를 email로 찾아 연결했습니다.',
      published: true,
      author: {
        // connect는 새 User를 만들지 않고 기존 User를 연결합니다.
        // where에 사용할 수 있는 id, email 같은 unique 필드가 필요합니다.
        connect: {
          email: authorEmail,
        },
      },
    },
    // 연결된 작성자 정보까지 생성 결과에 포함합니다.
    include: {
      author: true,
    },
  });

  console.dir(post, { depth: null });
  return post;
}

/**
 * 5) createMany: 동일한 작성자의 Post를 여러 건 생성
 *
 * 대량 생성 결과로 생성된 레코드 대신 { count }를 반환합니다.
 * createMany 데이터에는 nested relation을 사용할 수 없으므로 authorId를
 * 직접 전달합니다.
 */
export async function runCreateMany(authorId: number) {
  console.log('--- [5] Post.createMany 실행 ---');

  // createMany는 data 배열에 있는 여러 Post를 벌크 생성합니다.
  // nested create/connect는 사용할 수 없으므로 authorId를 직접 전달합니다.
  const result = await prisma.post.createMany({
    data: [
      {
        title: 'createMany 게시글 1',
        content: '벌크 생성한 첫 번째 게시글입니다.',
        authorId,
      },
      {
        title: 'createMany 게시글 2',
        content: '벌크 생성한 두 번째 게시글입니다.',
        published: true,
        authorId,
      },
    ],
  });

  // createMany는 생성된 Post 객체가 아니라 생성 건수를 반환합니다.
  console.log(result); // { count: 2 }
  return result;
}

/**
 * 6) 명시적 다대다 관계 생성
 *
 * PostLike는 User와 Post를 연결하는 모델입니다. 두 relation에 connect를
 * 사용해 기존 User와 Post 사이의 좋아요 레코드를 생성합니다.
 */
export async function runCreatePostLike(userId: number, postId: number) {
  console.log('--- [6] PostLike.create 실행 ---');

  // 명시적 다대다 연결 모델인 PostLike 레코드를 한 건 생성합니다.
  // PostLike의 기본 키는 userId와 postId의 조합이므로 같은 사용자가
  // 같은 게시글에 두 번 좋아요를 누르면 unique 오류가 발생합니다.
  const postLike = await prisma.postLike.create({
    data: {
      user: {
        // 전달받은 id에 해당하는 기존 User를 연결합니다.
        connect: { id: userId },
      },
      post: {
        // 전달받은 id에 해당하는 기존 Post를 연결합니다.
        connect: { id: postId },
      },
    },
    // 생성 결과를 확인할 수 있도록 양쪽 관계 데이터도 함께 조회합니다.
    include: {
      user: true,
      post: true,
    },
  });

  console.dir(postLike, { depth: null });
  return postLike;
}
