import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runBatchedRelationRead,
  runDefaultNestedRead,
  runRelationLoadStrategyComparison,
} from '../../src/ch05/relation-loading-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch05-relation-loading-test.local';

// 테스트에서 만든 관계 데이터의 PK를 저장해 전체 조회 결과 중
// 검증 대상 User와 Post를 안정적으로 식별합니다.
let authorId: number;
let likerId: number;
let likedPostId: number;

/**
 * 기본 관계 로딩, join/query 전략과 명시적 배치 조회 결과를 검증합니다.
 */
describe('ch05 관계 로딩 전략', () => {
  /**
   * 관계 로딩 예제가 공통으로 사용할 작성자, 게시글과 좋아요를 생성합니다.
   * 공개 글 두 건과 비공개 글 한 건을 만들어 published 필터도 함께 검증합니다.
   */
  beforeAll(async () => {
    // 이전 테스트가 비정상 종료되어 데이터가 남아 있어도 unique 충돌이
    // 발생하지 않도록 이 테스트 전용 email 도메인의 User만 제거합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    // User.create의 nested write로 작성자와 Post를 같은 작업에서 생성합니다.
    // include로 Post를 반환받아 좋아요 대상의 id를 찾습니다.
    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: '관계 로딩 작성자',
        posts: {
          create: [
            {
              title: '관계 로딩 공개 글 1',
              published: true,
              createdAt: new Date(Date.now() - 1_000),
            },
            {
              title: '관계 로딩 공개 글 2',
              published: true,
              createdAt: new Date(Date.now() - 2_000),
            },
            {
              title: '관계 로딩 비공개 글',
              published: false,
            },
          ],
        },
      },
      include: {
        posts: true,
      },
    });

    // 작성자와 좋아요 사용자를 분리해 중첩 관계의 방향도 검증합니다.
    const liker = await prisma.user.create({
      data: {
        email: `liker${EMAIL_DOMAIN}`,
        displayName: '관계 로딩 좋아요 사용자',
      },
    });

    const likedPost = author.posts.find((post) => post.published);

    if (!likedPost) {
      throw new Error('관계 로딩 테스트 Post를 생성하지 못했습니다.');
    }

    authorId = author.id;
    likerId = liker.id;
    likedPostId = likedPost.id;

    // User와 Post의 PK를 외래 키로 전달해 명시적 다대다 연결을 생성합니다.
    await prisma.postLike.create({
      data: {
        userId: likerId,
        postId: likedPostId,
      },
    });
  });

  afterAll(async () => {
    // User 관계에 설정된 onDelete: Cascade에 따라 연결된 Post와
    // PostLike도 함께 삭제되므로 User만 조건부로 정리하면 됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('기본 nested read로 공개 Post와 좋아요 User를 조회한다', async () => {
    const users = await runDefaultNestedRead();
    const author = users.find((user) => user.id === authorId);

    expect(author).toBeDefined();

    if (!author) {
      throw new Error('기본 관계 로딩 결과에서 작성자를 찾지 못했습니다.');
    }

    // 비공개 글은 where 조건에서 제외되어 공개 글 두 건만 남아야 합니다.
    expect(author.posts).toHaveLength(2);
    expect(author.posts.every((post) => post.published)).toBe(true);

    const likedPost = author.posts.find((post) => post.id === likedPostId);
    expect(likedPost?.likes[0]?.user).toMatchObject({
      id: likerId,
      email: `liker${EMAIL_DOMAIN}`,
    });
  });

  it('join과 query 전략이 같은 형태의 관계 결과를 반환한다', async () => {
    const { joinResult, queryResult } = await runRelationLoadStrategyComparison();

    const joinAuthor = joinResult.find((user) => user.id === authorId);
    const queryAuthor = queryResult.find((user) => user.id === authorId);

    expect(joinAuthor).toBeDefined();
    expect(queryAuthor).toBeDefined();
    // 관계 로딩 방식은 달라도 선택 필드와 관계 트리 결과는 같아야 합니다.
    expect(queryAuthor).toEqual(joinAuthor);
    expect(joinAuthor?.posts).toHaveLength(2);
  });

  it('in 필터로 조회한 Post를 authorId 기준 User 트리로 조합한다', async () => {
    const users = await runBatchedRelationRead();
    const author = users.find((user) => user.id === authorId);

    expect(author).toBeDefined();

    if (!author) {
      throw new Error('배치 관계 조회 결과에서 작성자를 찾지 못했습니다.');
    }

    // 배치 조회한 Post가 빠짐없이 해당 authorId의 User 아래에 조합됐는지 확인합니다.
    expect(author.posts).toHaveLength(2);
    expect(author.posts.every((post) => post.authorId === authorId)).toBe(true);

    const likedPost = author.posts.find((post) => post.id === likedPostId);
    expect(likedPost?.likes[0]?.user).toEqual({
      id: likerId,
      displayName: '관계 로딩 좋아요 사용자',
    });
  });
});
