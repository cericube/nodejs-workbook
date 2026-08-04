import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  runExecuteRawTransaction,
  runExecuteRawUnpublishByAuthor,
} from '../../src/ch06/execute-raw-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch06-execute-raw-test.local';

// 각 테스트에서 같은 User와 Post의 변경 전후 상태를 조회하기 위한 PK입니다.
let authorId: number;
let publishedPostIds: number[];
let draftPostId: number;

/**
 * $executeRaw의 변경 건수와 Raw SQL 배열 트랜잭션의 최종 DB 상태를 검증합니다.
 */
describe('ch06 $executeRaw', () => {
  /**
   * 변경 대상인 공개 글 두 건과 변경 대상이 아닌 비공개 글 한 건을 생성합니다.
   */
  beforeAll(async () => {
    // 실패한 이전 실행의 테스트 데이터가 남아 있어도 재실행할 수 있게 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: '변경 전 이름',
        posts: {
          create: [
            { title: '비공개 전환 대상 1', published: true },
            { title: '비공개 전환 대상 2', published: true },
            { title: '기존 비공개 글', published: false },
          ],
        },
      },
      include: { posts: true },
    });

    const publishedPosts = author.posts.filter((post) => post.published);
    const draftPost = author.posts.find((post) => !post.published);

    if (publishedPosts.length !== 2 || !draftPost) {
      throw new Error('$executeRaw 테스트용 Post를 생성하지 못했습니다.');
    }

    authorId = author.id;
    publishedPostIds = publishedPosts.map((post) => post.id);
    draftPostId = draftPost.id;
  });

  beforeEach(async () => {
    // 각 테스트가 같은 초기 상태에서 시작하도록 변경된 이름과 공개 여부를 복원합니다.
    await prisma.user.update({
      where: { id: authorId },
      data: { displayName: '변경 전 이름' },
    });
    await prisma.post.updateMany({
      where: { id: { in: publishedPostIds } },
      data: { published: true },
    });
    await prisma.post.update({
      where: { id: draftPostId },
      data: { published: false },
    });
  });

  afterAll(async () => {
    // 작성자 User를 삭제하면 관계의 onDelete: Cascade로 Post도 제거됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('공개 Post만 변경하고 영향받은 행 개수를 반환한다', async () => {
    const affectedCount = await runExecuteRawUnpublishByAuthor(authorId);
    const posts = await prisma.post.findMany({
      where: { authorId },
      orderBy: { id: 'asc' },
    });

    // UPDATE 조건에 일치한 공개 글 두 건만 변경 건수에 포함됩니다.
    expect(affectedCount).toBe(2);
    expect(posts).toHaveLength(3);
    expect(posts.every((post) => !post.published)).toBe(true);
  });

  it('트랜잭션으로 User 이름과 공개 Post를 함께 변경한다', async () => {
    const result = await runExecuteRawTransaction(authorId, '트랜잭션 변경 이름');
    const author = await prisma.user.findUniqueOrThrow({
      where: { id: authorId },
      include: { posts: true },
    });

    // 두 Raw SQL의 변경 건수와 트랜잭션 커밋 후 상태를 함께 확인합니다.
    expect(result).toEqual({
      updatedUserCount: 1,
      unpublishedPostCount: 2,
    });
    expect(author.displayName).toBe('트랜잭션 변경 이름');
    expect(author.posts.every((post) => !post.published)).toBe(true);
  });
});
