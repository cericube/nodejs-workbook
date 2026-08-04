import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runQueryRawByAuthor, runQueryRawPostStatistics } from '../../src/ch06/query-raw-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch06-query-raw-test.local';

// JOIN과 집계 결과에서 테스트 작성자와 공개 글을 찾기 위한 PK입니다.
let authorId: number;
let publishedPostId: number;

/**
 * $queryRaw의 JOIN·집계 결과 타입과 값 파라미터 바인딩을 검증합니다.
 */
describe('ch06 $queryRaw', () => {
  /**
   * 공개·비공개 Post와 좋아요 두 건을 만들어 필터와 COUNT를 함께 검증합니다.
   */
  beforeAll(async () => {
    // 이 테스트 전용 도메인만 삭제해 다른 장의 데이터는 보존합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    // 통계 쿼리의 LIMIT 10 안에 테스트 Post가 안정적으로 포함되도록
    // 기존 데이터보다 충분히 나중인 createdAt을 지정합니다.
    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: 'Raw SQL 작성자',
        posts: {
          create: [
            {
              title: 'Raw SQL 통계 공개 글',
              published: true,
              createdAt: new Date('2099-01-02T00:00:00.000Z'),
            },
            {
              title: 'Raw SQL 비공개 글',
              published: false,
              createdAt: new Date('2099-01-01T00:00:00.000Z'),
            },
          ],
        },
      },
      include: { posts: true },
    });

    const liker = await prisma.user.create({
      data: {
        email: `liker${EMAIL_DOMAIN}`,
        displayName: 'Raw SQL 좋아요 사용자',
      },
    });

    const publishedPost = author.posts.find((post) => post.published);

    if (!publishedPost) {
      throw new Error('Raw SQL 테스트용 공개 Post를 생성하지 못했습니다.');
    }

    authorId = author.id;
    publishedPostId = publishedPost.id;

    // 작성자와 별도 사용자가 같은 Post에 좋아요를 눌러 COUNT 결과가 2인지 검증합니다.
    await prisma.postLike.createMany({
      data: [
        { userId: author.id, postId: publishedPost.id },
        { userId: liker.id, postId: publishedPost.id },
      ],
    });
  });

  afterAll(async () => {
    // User의 onDelete: Cascade로 테스트 Post와 PostLike도 함께 삭제됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('JOIN과 COUNT 결과를 정의한 행 타입에 맞게 반환한다', async () => {
    const rows = await runQueryRawPostStatistics();
    const post = rows.find((row) => row.postId === publishedPostId);

    // LEFT JOIN으로 연결된 PostLike 두 건이 ::int 숫자로 반환돼야 합니다.
    expect(post).toBeDefined();
    expect(post).toMatchObject({
      postId: publishedPostId,
      title: 'Raw SQL 통계 공개 글',
      authorName: 'Raw SQL 작성자',
      likeCount: 2,
    });
    expect(post?.createdAt).toBeInstanceOf(Date);
    expect(typeof post?.likeCount).toBe('number');
  });

  it('바인딩한 authorId와 published 조건에 맞는 Post만 반환한다', async () => {
    const posts = await runQueryRawByAuthor(authorId);

    // 같은 작성자의 비공개 글은 SQL의 published = TRUE 조건에서 제외됩니다.
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: publishedPostId,
      title: 'Raw SQL 통계 공개 글',
      published: true,
    });
    expect(posts[0]?.createdAt).toBeInstanceOf(Date);
  });
});
