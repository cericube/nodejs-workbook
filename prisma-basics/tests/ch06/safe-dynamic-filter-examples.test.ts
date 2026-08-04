import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSafeDynamicFilter } from '../../src/ch06/safe-dynamic-filter-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch06-safe-filter-test.local';

// 작성자와 공개 여부 조합별 결과를 정확히 식별하기 위한 PK입니다.
let authorId: number;
let publishedPostId: number;
let draftPostId: number;

/**
 * Prisma.sql 조각에 전달한 authorId와 boolean 값이 안전한 조건으로 적용되는지 검증합니다.
 */
describe('ch06 Prisma.sql 동적 필터', () => {
  /**
   * 한 작성자의 공개·비공개 글과 다른 작성자의 공개 글을 준비해
   * authorId와 published 조건이 모두 적용되는지 확인합니다.
   */
  beforeAll(async () => {
    // 테스트 전용 이메일 도메인을 사용해 기존 User 데이터와 격리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: '동적 필터 작성자',
        posts: {
          create: [
            { title: '동적 필터 공개 글', published: true },
            { title: '동적 필터 비공개 글', published: false },
          ],
        },
      },
      include: { posts: true },
    });

    // 다른 User의 공개 글을 함께 만들어 authorId 조건이 실제로 적용되는지 확인합니다.
    await prisma.user.create({
      data: {
        email: `other${EMAIL_DOMAIN}`,
        displayName: '다른 작성자',
        posts: {
          create: { title: '다른 작성자의 공개 글', published: true },
        },
      },
    });

    const publishedPost = author.posts.find((post) => post.published);
    const draftPost = author.posts.find((post) => !post.published);

    if (!publishedPost || !draftPost) {
      throw new Error('동적 필터 테스트용 Post를 생성하지 못했습니다.');
    }

    authorId = author.id;
    publishedPostId = publishedPost.id;
    draftPostId = draftPost.id;
  });

  afterAll(async () => {
    // User 관계의 Cascade 설정으로 연결된 테스트 Post도 함께 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('published=true 조건으로 해당 작성자의 공개 Post만 반환한다', async () => {
    const posts = await runSafeDynamicFilter(authorId, true);

    // 다른 작성자의 공개 글은 authorId 조건 때문에 결과에 포함되지 않습니다.
    expect(posts.map((post) => post.id)).toEqual([publishedPostId]);
    expect(posts[0]).toMatchObject({
      published: true,
      authorId,
    });
  });

  it('published=false도 유효한 바인딩 값으로 처리한다', async () => {
    const posts = await runSafeDynamicFilter(authorId, false);

    // false를 조건 생략으로 오해하지 않고 실제 boolean 값으로 바인딩해야 합니다.
    expect(posts.map((post) => post.id)).toEqual([draftPostId]);
    expect(posts[0]).toMatchObject({
      published: false,
      authorId,
    });
  });
});
