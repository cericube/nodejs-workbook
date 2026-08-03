import type { User } from '../../generated/prisma/client';
import { prisma } from '../shared/database';

/**
 * 1) findUnique: 고유 조건으로 User 한 건 조회
 *
 * User.email은 스키마에서 @unique로 선언되어 있으므로 단일 User를 찾는
 * 조건으로 사용할 수 있습니다. 일치하는 User가 없으면 null을 반환합니다.
 */
export async function runFindUnique(email: string): Promise<User | null> {
  console.log('--- [1] User.findUnique 실행 ---');

  // findUnique의 where에는 @id, @unique 또는 복합 고유 키처럼
  // 레코드 한 건을 식별할 수 있는 고유 조건을 전달해야 합니다.
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  console.log(user);
  return user;
}

/**
 * 2) findUniqueOrThrow: 반드시 존재해야 하는 Post 한 건 조회
 *
 * findUnique와 달리 조회 결과가 없으면 Prisma가 예외를 발생시킵니다.
 * 이후 로직에서 null을 별도로 처리하지 않고 존재를 보장해야 할 때 유용합니다.
 */
export async function runFindUniqueOrThrow(postId: number) {
  console.log('--- [2] Post.findUniqueOrThrow 실행 ---');

  const post = await prisma.post.findUniqueOrThrow({
    // Post.id는 @id 필드이므로 고유 조회 조건으로 사용할 수 있습니다.
    where: {
      id: postId,
    },
    // include는 Post의 스칼라 필드와 함께 관계 데이터를 반환합니다.
    // _count를 사용하면 likes 레코드 전체 대신 연결된 개수만 조회할 수 있습니다.
    include: {
      author: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      _count: {
        select: {
          likes: true,
        },
      },
    },
  });

  console.dir(post, { depth: null });
  return post;
}

/**
 * 3) findFirst: 조건과 정렬에 맞는 첫 번째 Post 조회
 *
 * 고유하지 않은 조건에서 레코드 한 건만 필요할 때 사용합니다. 결과가 없으면
 * null을 반환하며, orderBy를 생략하면 어떤 레코드가 먼저 올지 보장되지 않습니다.
 */
export async function runFindFirst(userId: number) {
  console.log('--- [3] Post.findFirst 실행 ---');

  const post = await prisma.post.findFirst({
    // where의 여러 필드는 기본적으로 AND 조건으로 결합됩니다.
    where: {
      authorId: userId,
      published: true,
    },
    // 조건을 만족하는 게시글 중 가장 최근에 수정된 게시글을 선택합니다.
    orderBy: {
      updatedAt: 'desc',
    },
    // select를 사용하면 필요한 필드와 관계 데이터만 반환할 수 있습니다.
    // select와 include는 같은 단계에서 동시에 사용할 수 없습니다.
    select: {
      id: true,
      title: true,
      updatedAt: true,
      author: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  console.dir(post, { depth: null });
  return post;
}

/**
 * 4) findFirstOrThrow: 일반 조건으로 반드시 존재해야 하는 Post 조회
 *
 * 제목에 검색어가 포함된 공개 게시글 중 가장 최근 게시글을 반환합니다.
 * 조건을 만족하는 게시글이 없으면 예외가 발생합니다.
 */
export async function runFindFirstOrThrow(keyword: string) {
  console.log('--- [4] Post.findFirstOrThrow 실행 ---');

  const post = await prisma.post.findFirstOrThrow({
    where: {
      published: true,
      title: {
        // contains는 부분 문자열을 검색합니다. PostgreSQL에서
        // mode: 'insensitive'를 지정하면 영문 대소문자를 구분하지 않습니다.
        contains: keyword,
        mode: 'insensitive',
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(post);
  return post;
}

/**
 * 5) findMany: Post 목록을 페이지 단위로 조회
 *
 * findMany는 조건을 만족하는 레코드 배열을 반환하며 결과가 없으면 빈 배열을
 * 반환합니다. skip과 take를 함께 사용해 오프셋 페이지네이션을 구현합니다.
 */
export async function runFindMany(page = 1, pageSize = 10) {
  console.log('--- [5] Post.findMany 실행 ---');

  // 잘못된 페이지 값으로 음수 OFFSET이나 LIMIT이 만들어지지 않게 보정합니다.
  const currentPage = Math.max(1, page);
  const take = Math.max(1, pageSize);

  const posts = await prisma.post.findMany({
    where: {
      published: true,
    },
    // skip은 앞에서 건너뛸 레코드 수이고 take는 가져올 최대 개수입니다.
    skip: (currentPage - 1) * take,
    take,
    // 페이지 사이에서 결과 순서가 바뀌지 않도록 정렬을 명시합니다.
    // createdAt이 같은 경우에도 순서가 일정하도록 id를 보조 정렬로 사용합니다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      title: true,
      published: true,
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
  });

  console.dir(posts, { depth: null });
  return posts;
}
