import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runNestedCreatePostWithInitialLike,
  runNestedCreateUserWithPost,
} from '../../src/ch07/nested-write-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch07-nested-write-test.local';

// 기존 User 연결이 필요한 Post + PostLike 예제에 전달할 작성자 PK입니다.
let authorId: number;

/**
 * nested write의 관계 연결 결과와 중첩 작업 실패 시 원자적 롤백을 검증합니다.
 */
describe('ch07 nested write', () => {
  /**
   * 기존 User connect 예제에서 사용할 작성자를 생성합니다.
   * User와 첫 Post를 함께 만드는 테스트는 별도의 email을 사용합니다.
   */
  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const author = await prisma.user.create({
      data: {
        email: `existing-author${EMAIL_DOMAIN}`,
        displayName: '기존 작성자',
      },
    });
    authorId = author.id;
  });

  afterAll(async () => {
    // User 삭제의 Cascade로 nested write에서 생성한 Post와 PostLike도 정리됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('User와 authorId가 자동 연결된 첫 Post를 함께 생성한다', async () => {
    const email = `new-user${EMAIL_DOMAIN}`;
    const user = await runNestedCreateUserWithPost(email, '첫 중첩 게시글');

    expect(user.email).toBe(email);
    expect(user.posts).toHaveLength(1);
    expect(user.posts[0]).toMatchObject({
      title: '첫 중첩 게시글',
      authorId: user.id,
      published: false,
    });
  });

  it('Post와 작성자가 누른 PostLike를 같은 중첩 쓰기로 생성한다', async () => {
    const post = await runNestedCreatePostWithInitialLike(authorId, '첫 좋아요 포함 게시글');

    expect(post.author.id).toBe(authorId);
    expect(post.likes).toHaveLength(1);
    // PostLike 복합 키의 양쪽 값이 새 Post와 기존 User를 가리켜야 합니다.
    expect(post.likes[0]).toMatchObject({
      userId: authorId,
      postId: post.id,
    });
  });

  it('존재하지 않는 User 연결이 실패하면 Post도 생성하지 않는다', async () => {
    const title = '연결 실패로 롤백할 게시글';

    await expect(runNestedCreatePostWithInitialLike(-1, title)).rejects.toBeDefined();

    // nested connect 오류가 최상위 Post 생성까지 롤백했는지 DB에서 확인합니다.
    const postCount = await prisma.post.count({ where: { title } });
    expect(postCount).toBe(0);
  });
});
