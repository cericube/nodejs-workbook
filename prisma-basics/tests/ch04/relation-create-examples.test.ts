import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runConnectOrCreate,
  runCreatePostLike,
  runCreateWithConnect,
  runNestedCreate,
} from '../../src/ch04/relation-create-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch04-relation-create-test.local';

/**
 * nested write와 관계 연결 API가 올바른 외래 키 관계를 만드는지 검증합니다.
 */
describe('ch04 관계 생성', () => {
  beforeAll(async () => {
    // unique email 충돌을 방지하기 위해 테스트 전용 데이터만 삭제합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    // 연결된 Post와 PostLike는 User 삭제 시 cascade로 정리됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('nested create, connect, connectOrCreate와 중간 모델 생성을 수행한다', async () => {
    // User와 Post 두 건을 하나의 nested write로 생성합니다.
    const nestedUser = await runNestedCreate(`nested${EMAIL_DOMAIN}`);

    // 생성된 모든 Post가 새 User를 작성자로 참조해야 합니다.
    expect(nestedUser.posts).toHaveLength(2);
    expect(
      nestedUser.posts.every((post) => post.authorId === nestedUser.id),
    ).toBe(true);

    // 기존 User를 email unique 조건으로 새 Post에 연결합니다.
    const connectedPost = await runCreateWithConnect(nestedUser.email);
    expect(connectedPost.author.id).toBe(nestedUser.id);

    // 해당 이메일의 User가 없으므로 connectOrCreate의 create 분기를 검증합니다.
    const connectedOrCreatedPost = await runConnectOrCreate(
      `connected${EMAIL_DOMAIN}`,
    );
    expect(connectedOrCreatedPost.author.email).toBe(`connected${EMAIL_DOMAIN}`);

    // 앞서 만든 User와 Post를 명시적 중간 모델로 연결합니다.
    const postLike = await runCreatePostLike(
      nestedUser.id,
      connectedOrCreatedPost.id,
    );
    expect(postLike.user.id).toBe(nestedUser.id);
    expect(postLike.post.id).toBe(connectedOrCreatedPost.id);
  });
});
