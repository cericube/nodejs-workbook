import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanUpExampleData,
  runDelete,
  runDeleteMany,
  runDeletePostLike,
} from '../../src/ch03/delete-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch03-delete-test.local';

let authorId: number;
let likerId: number;
let postIds: number[];

/**
 * 단건/다건 삭제와 외래 키 cascade 정리 동작을 실제 DB에서 검증합니다.
 */
describe('ch03 delete 예제', () => {
  beforeEach(async () => {
    // 각 삭제 테스트가 같은 초기 상태를 갖도록 데이터를 매번 새로 만듭니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        posts: {
          create: [{ title: '삭제할 게시글 1' }, { title: '삭제할 게시글 2' }],
        },
      },
      include: { posts: { orderBy: { id: 'asc' } } },
    });
    const liker = await prisma.user.create({
      data: { email: `liker${EMAIL_DOMAIN}` },
    });

    authorId = author.id;
    likerId = liker.id;
    postIds = author.posts.map((post) => post.id);

    // 두 Post에 각각 좋아요를 연결해 단건, 다건, cascade 삭제에 사용합니다.
    await prisma.postLike.createMany({
      data: postIds.map((postId) => ({ userId: likerId, postId })),
    });
  });

  afterEach(async () => {
    // 테스트 도중 일부 데이터만 삭제됐더라도 남은 User와 관계를 모두 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Post 한 건과 연결된 PostLike를 함께 삭제한다', async () => {
    const postId = postIds[0];
    if (!postId) {
      throw new Error('삭제할 게시글이 없습니다.');
    }

    const deletedPost = await runDelete(postId);

    // delete 반환값과 DB의 실제 삭제 상태를 모두 확인합니다.
    expect(deletedPost).toMatchObject({ id: postId, authorId });
    expect(deletedPost._count.likes).toBe(1);
    await expect(prisma.post.findUnique({ where: { id: postId } })).resolves.toBeNull();
    await expect(
      prisma.postLike.count({ where: { postId } }),
    ).resolves.toBe(0);
  });

  it('복합 기본 키로 PostLike 한 건을 삭제한다', async () => {
    const postId = postIds[0];
    if (!postId) {
      throw new Error('좋아요가 연결된 게시글이 없습니다.');
    }

    const deletedLike = await runDeletePostLike(likerId, postId);

    // 삭제된 복합 키를 확인하고 같은 키의 레코드가 남지 않았는지 검사합니다.
    expect(deletedLike).toMatchObject({ userId: likerId, postId });
    await expect(
      prisma.postLike.count({ where: { userId: likerId, postId } }),
    ).resolves.toBe(0);
  });

  it('특정 User의 PostLike를 모두 삭제한다', async () => {
    const result = await runDeleteMany(likerId);

    expect(result.count).toBe(2);
    await expect(
      prisma.postLike.count({ where: { userId: likerId } }),
    ).resolves.toBe(0);
  });

  it('지정한 도메인의 User와 관계 데이터를 정리한다', async () => {
    const result = await cleanUpExampleData(EMAIL_DOMAIN);

    // User 두 명과 작성자의 Post가 cascade로 모두 제거돼야 합니다.
    expect(result.count).toBe(2);
    await expect(
      prisma.user.count({ where: { email: { endsWith: EMAIL_DOMAIN } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.post.count({ where: { authorId } }),
    ).resolves.toBe(0);
  });
});
