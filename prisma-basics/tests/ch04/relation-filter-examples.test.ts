import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runComplexRelationQuery,
  runManyToManyRelationFilters,
  runToManyRelationFilters,
  runToOneRelationFilters,
} from '../../src/ch04/relation-filter-examples';
import { prisma } from '../../src/shared/database';

const TEST_DOMAIN_SUFFIX = 'ch04-relation-filter-test.local';
// to-one 관계의 is/isNot 결과를 구분하기 위한 대상 도메인입니다.
const TARGET_DOMAIN = `@target.${TEST_DOMAIN_SUFFIX}`;

let targetUserId: number;
let likedPostId: number;
let unlikedPostId: number;

/**
 * to-one, to-many, 명시적 다대다 관계 필터와 복합 조건을 검증합니다.
 */
describe('ch04 관계 필터', () => {
  beforeAll(async () => {
    // suffix가 같은 테스트 User를 모두 제거해 반복 실행 가능한 상태로 만듭니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: TEST_DOMAIN_SUFFIX } },
    });

    // 대상 도메인 User에게 공개 Post 두 건을 연결합니다.
    const targetUser = await prisma.user.create({
      data: {
        email: `author${TARGET_DOMAIN}`,
        displayName: '공개 글만 있는 사용자',
        posts: {
          create: [
            { title: '좋아요가 있는 공개 글', published: true },
            { title: '좋아요가 없는 공개 글', published: true },
          ],
        },
      },
      include: { posts: { orderBy: { id: 'asc' } } },
    });

    targetUserId = targetUser.id;
    likedPostId = targetUser.posts[0]!.id;
    unlikedPostId = targetUser.posts[1]!.id;

    // 두 Post 중 한 건에만 좋아요를 만들어 some/none 결과를 구분합니다.
    await prisma.postLike.create({
      data: { userId: targetUserId, postId: likedPostId },
    });

    // none: {} 검증에 사용할 게시글 없는 User입니다.
    await prisma.user.create({
      data: {
        email: `empty@target.${TEST_DOMAIN_SUFFIX}`,
        displayName: '게시글이 없는 사용자',
      },
    });

    // isNot 검증에 사용할 다른 도메인의 User와 초안입니다.
    await prisma.user.create({
      data: {
        email: `author@other.${TEST_DOMAIN_SUFFIX}`,
        displayName: '다른 도메인 사용자',
        posts: { create: { title: '다른 도메인의 초안', published: false } },
      },
    });
  });

  afterAll(async () => {
    // cascade를 이용해 준비한 User, Post, PostLike를 한 번에 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: TEST_DOMAIN_SUFFIX } },
    });
    await prisma.$disconnect();
  });

  it('to-one 관계에 is와 isNot 필터를 적용한다', async () => {
    const { matchingPosts, otherPosts } =
      await runToOneRelationFilters(TARGET_DOMAIN);

    // 대상 도메인 글은 is, 다른 도메인 글은 isNot 결과에 포함돼야 합니다.
    expect(matchingPosts).toContainEqual(
      expect.objectContaining({ id: likedPostId }),
    );
    expect(otherPosts).toContainEqual(
      expect.objectContaining({ title: '다른 도메인의 초안' }),
    );
  });

  it('to-many 관계에 some, none, every 필터를 적용한다', async () => {
    const result = await runToManyRelationFilters();

    // 공개 글 보유, 글 없음, 모든 글 공개의 세 집합을 각각 확인합니다.
    expect(result.usersWithPublishedPost).toContainEqual(
      expect.objectContaining({ id: targetUserId }),
    );
    expect(result.usersWithoutPosts).toContainEqual(
      expect.objectContaining({ displayName: '게시글이 없는 사용자' }),
    );
    expect(result.usersWithOnlyPublishedPosts).toContainEqual(
      expect.objectContaining({ id: targetUserId }),
    );
  });

  it('명시적 다대다 관계를 some과 none으로 필터링한다', async () => {
    const { likedPosts, postsWithoutLikes } =
      await runManyToManyRelationFilters(targetUserId);

    // 좋아요가 있는 Post와 전혀 없는 Post가 서로 다른 결과에 포함돼야 합니다.
    expect(likedPosts).toContainEqual(expect.objectContaining({ id: likedPostId }));
    expect(postsWithoutLikes).toContainEqual(
      expect.objectContaining({ id: unlikedPostId }),
    );
  });

  it('스칼라 조건과 여러 관계 조건을 결합한다', async () => {
    const posts = await runComplexRelationQuery(TARGET_DOMAIN);

    // 반환된 모든 글이 좋아요 및 대상 작성자 조건을 동시에 만족해야 합니다.
    expect(posts).toContainEqual(expect.objectContaining({ id: likedPostId }));
    expect(posts.every((post) => post._count.likes > 0)).toBe(true);
    expect(posts.every((post) => post.author.id === targetUserId)).toBe(true);
  });
});
