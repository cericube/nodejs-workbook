import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runIncludeTree,
  runMixedTree,
  runSelectTree,
} from '../../src/ch05/nested-relation-query-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch05-nested-query-test.local';

// 테스트 준비 단계에서 생성한 PK를 저장해 각 조회 결과에서
// 다른 데이터가 아닌 정확한 테스트 레코드를 찾습니다.
let authorId: number;
let likerId: number;
let likedPostId: number;

/**
 * include, select와 단계별 조합이 만드는 중첩 관계 트리를 검증합니다.
 */
describe('ch05 중첩 관계 트리 조회', () => {
  /**
   * 모든 테스트가 공유할 User, Post, PostLike 관계 데이터를 생성합니다.
   * 공개 여부, 최신순 정렬, take 제한을 함께 검증할 수 있도록 게시글의
   * 개수와 createdAt 값을 의도적으로 다르게 구성합니다.
   */
  beforeAll(async () => {
    // 이전 테스트 데이터를 제거해 email unique 충돌을 방지합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const now = Date.now();

    // take: 3과 published 필터를 검증할 공개 글 네 건과 초안 한 건을 만듭니다.
    // nested create를 사용해 작성자와 게시글을 한 번에 만들고,
    // include로 생성된 Post id를 받아 이후 PostLike 생성에 사용합니다.
    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: '중첩 조회 작성자',
        posts: {
          create: [
            {
              title: '공개 게시글 1',
              content: '첫 번째 본문',
              published: true,
              createdAt: new Date(now - 1_000),
            },
            {
              title: '공개 게시글 2',
              published: true,
              createdAt: new Date(now - 2_000),
            },
            {
              title: '공개 게시글 3',
              published: true,
              createdAt: new Date(now - 3_000),
            },
            {
              title: '공개 게시글 4',
              published: true,
              createdAt: new Date(now - 4_000),
            },
            {
              title: '비공개 게시글',
              published: false,
              createdAt: new Date(now),
            },
          ],
        },
      },
      include: {
        posts: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // 좋아요 관계의 반대편에 사용할 별도 User를 생성합니다.
    const liker = await prisma.user.create({
      data: {
        email: `liker${EMAIL_DOMAIN}`,
        displayName: '좋아요 사용자',
      },
    });

    const likedPost = author.posts.find((post) => post.title === '공개 게시글 1');

    if (!likedPost) {
      throw new Error('좋아요 대상 Post를 생성하지 못했습니다.');
    }

    authorId = author.id;
    likerId = liker.id;
    likedPostId = likedPost.id;

    // 복합 기본 키를 구성하는 userId와 postId로 명시적 다대다 관계를 만듭니다.
    await prisma.postLike.create({
      data: {
        userId: likerId,
        postId: likedPostId,
      },
    });
  });

  afterAll(async () => {
    // User 삭제의 cascade로 Post와 PostLike까지 함께 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('include로 기본 필드와 중첩 관계 전체를 반환한다', async () => {
    const users = await runIncludeTree();
    const author = users.find((user) => user.id === authorId);

    expect(author).toBeDefined();

    if (!author) {
      throw new Error('include 결과에서 테스트 작성자를 찾지 못했습니다.');
    }

    // 공개 글 필터, 최신순 정렬과 take: 3이 모두 적용돼야 합니다.
    expect(author.posts).toHaveLength(3);
    expect(author.posts.every((post) => post.published)).toBe(true);
    expect(author.posts[0]?.title).toBe('공개 게시글 1');

    // include는 관계 모델의 기본 스칼라 필드도 반환하므로 email까지 확인할 수 있습니다.
    const likedPost = author.posts.find((post) => post.id === likedPostId);
    expect(likedPost?._count.likes).toBe(1);
    expect(likedPost?.likes[0]?.user).toMatchObject({
      id: likerId,
      email: `liker${EMAIL_DOMAIN}`,
    });
  });

  it('select로 지정한 필드만 관계 단계별로 반환한다', async () => {
    const users = await runSelectTree();
    const author = users.find((user) => user.id === authorId);

    expect(author).toBeDefined();

    if (!author) {
      throw new Error('select 결과에서 테스트 작성자를 찾지 못했습니다.');
    }

    // 객체의 키를 검사해 select에 없는 email 같은 필드가 제외됐는지 확인합니다.
    expect(Object.keys(author).sort()).toEqual(['displayName', 'id', 'posts']);
    expect(author.posts).toHaveLength(3);

    const likedPost = author.posts.find((post) => post.id === likedPostId);
    // 중첩된 Post 단계도 select에서 지정한 필드만 반환해야 합니다.
    expect(Object.keys(likedPost ?? {}).sort()).toEqual([
      '_count',
      'createdAt',
      'id',
      'likes',
      'title',
    ]);
    expect(likedPost?.likes[0]?.user).toEqual({
      id: likerId,
      displayName: '좋아요 사용자',
    });
  });

  it('상위 select와 하위 include를 서로 다른 단계에서 조합한다', async () => {
    const users = await runMixedTree();
    const author = users.find((user) => user.id === authorId);

    expect(author).toBeDefined();

    if (!author) {
      throw new Error('혼합 조회 결과에서 테스트 작성자를 찾지 못했습니다.');
    }

    const likedPost = author.posts.find((post) => post.id === likedPostId);

    // Post 단계의 include는 기본 스칼라 필드를 유지해야 합니다.
    expect(likedPost).toHaveProperty('content');
    expect(likedPost).toHaveProperty('published', true);
    // likes 아래 User는 select에서 지정한 두 필드만 반환합니다.
    expect(likedPost?.likes[0]?.user).toEqual({
      id: likerId,
      displayName: '좋아요 사용자',
    });
  });
});
