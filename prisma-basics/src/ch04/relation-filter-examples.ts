import { prisma } from '../shared/database';

/**
 * 1) To-One 관계 필터: is와 isNot
 *
 * Post.author는 단일 User를 가리키는 필수 관계입니다. is는 작성자가 조건을
 * 만족하는 글을 찾고, isNot은 작성자가 조건을 만족하지 않는 글을 찾습니다.
 */
async function runToOneRelationFilters(emailDomain: string) {
  console.log('--- [1] To-One 관계 필터 ---');

  const matchingPosts = await prisma.post.findMany({
    where: {
      author: {
        is: {
          email: {
            endsWith: emailDomain,
            mode: 'insensitive',
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
      author: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  const otherPosts = await prisma.post.findMany({
    where: {
      author: {
        isNot: {
          email: {
            endsWith: emailDomain,
            mode: 'insensitive',
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
    },
  });

  console.log({ matchingPosts, otherPosts });
  return { matchingPosts, otherPosts };
}

/**
 * 2) To-Many 관계 필터: some, none, every
 *
 * User.posts는 여러 Post를 갖는 목록 관계입니다. some은 하나 이상, none은
 * 하나도 없음, every는 모든 관계 레코드가 조건을 만족하는지 검사합니다.
 */
async function runToManyRelationFilters() {
  console.log('--- [2] To-Many 관계 필터 ---');

  const usersWithPublishedPost = await prisma.user.findMany({
    where: {
      posts: {
        some: {
          published: true,
        },
      },
    },
    select: {
      id: true,
      displayName: true,
      _count: {
        select: {
          posts: {
            where: {
              published: true,
            },
          },
        },
      },
    },
  });

  const usersWithoutPosts = await prisma.user.findMany({
    where: {
      // none: {}는 연결된 Post가 하나도 없는 User를 찾는 패턴입니다.
      posts: {
        none: {},
      },
    },
    select: {
      id: true,
      displayName: true,
    },
  });

  const usersWithOnlyPublishedPosts = await prisma.user.findMany({
    where: {
      posts: {
        // every는 Post가 없는 User에게도 참이 됩니다. 게시글이 한 건 이상인
        // User만 원하면 some: {} 조건을 함께 사용해야 합니다.
        every: {
          published: true,
        },
        some: {},
      },
    },
    select: {
      id: true,
      displayName: true,
    },
  });

  console.log({
    usersWithPublishedPost,
    usersWithoutPosts,
    usersWithOnlyPublishedPosts,
  });

  return {
    usersWithPublishedPost,
    usersWithoutPosts,
    usersWithOnlyPublishedPosts,
  };
}

/**
 * 3) 명시적 다대다 관계 필터
 *
 * Post.likes에서 PostLike를 필터링해 특정 User가 좋아요한 게시글을 찾습니다.
 * where의 관계 필터와 select 내부의 관계 필터는 서로 독립적으로 동작합니다.
 */
async function runManyToManyRelationFilters(userId: number) {
  console.log('--- [3] PostLike 관계 필터 ---');

  const likedPosts = await prisma.post.findMany({
    where: {
      likes: {
        some: {
          userId,
        },
      },
    },
    select: {
      id: true,
      title: true,
      likes: {
        // 반환 결과에도 해당 User의 좋아요만 포함하도록 별도로 제한합니다.
        where: {
          userId,
        },
        select: {
          userId: true,
          createdAt: true,
        },
      },
    },
  });

  const postsWithoutLikes = await prisma.post.findMany({
    where: {
      likes: {
        none: {},
      },
    },
    select: {
      id: true,
      title: true,
      _count: {
        select: {
          likes: true,
        },
      },
    },
  });

  console.dir({ likedPosts, postsWithoutLikes }, { depth: null });
  return { likedPosts, postsWithoutLikes };
}

/**
 * 4) 여러 조건을 결합한 게시글 조회
 *
 * 최근 30일 이내의 공개 게시글 중 좋아요가 하나 이상이고, 작성자 이메일이
 * 지정한 도메인으로 끝나는 게시글을 조회합니다.
 */
async function runComplexRelationQuery(emailDomain: string) {
  console.log('--- [4] 복합 관계 조회 ---');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      published: true,
      createdAt: {
        gte: thirtyDaysAgo,
      },
      likes: {
        some: {},
      },
      author: {
        email: {
          endsWith: emailDomain,
          mode: 'insensitive',
        },
      },
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          displayName: true,
        },
      },
      _count: {
        select: {
          likes: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 10,
  });

  console.dir(posts, { depth: null });
  return posts;
}

/**
 * 관계 필터 예제 실행 진입점
 */
async function main(): Promise<void> {
  await runComplexRelationQuery('@create-example.local');

  // await runToOneRelationFilters('@create-example.local');
  // await runToManyRelationFilters();
  // await runManyToManyRelationFilters(1);
}

main()
  .catch((error: unknown) => {
    console.error('관계 필터 예제 실행 중 오류가 발생했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
