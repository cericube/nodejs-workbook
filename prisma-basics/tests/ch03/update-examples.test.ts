import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runUpdate,
  runUpdateMany,
  runUpdateManyAndReturn,
} from '../../src/ch03/update-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch03-update-test.local';

let userId: number;
let postIds: number[];

/**
 * 단건 nested update와 여러 레코드 일괄 수정의 결과를 검증합니다.
 */
describe('ch03 update 예제', () => {
  beforeEach(async () => {
    // 각 테스트가 동일한 수정 전 상태에서 시작하도록 매번 데이터를 재생성합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const user = await prisma.user.create({
      data: {
        email: `user${EMAIL_DOMAIN}`,
        displayName: '수정 전 사용자',
        posts: {
          create: [
            { title: '수정 전 게시글 1', published: false },
            { title: '수정 전 게시글 2', published: false },
          ],
        },
      },
      include: { posts: { orderBy: { id: 'asc' } } },
    });

    userId = user.id;
    // 생성된 Post id를 테스트 대상 함수의 인자로 전달하기 위해 저장합니다.
    postIds = user.posts.map((post) => post.id);
  });

  afterEach(async () => {
    // 한 테스트의 수정 결과가 다음 테스트에 영향을 주지 않도록 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('User와 연결된 Post를 nested update로 수정한다', async () => {
    const postId = postIds[0];
    // noUncheckedIndexedAccess 설정에 대응하면서 오류 원인도 명확히 남깁니다.
    if (!postId) {
      throw new Error('수정할 게시글이 없습니다.');
    }

    const user = await runUpdate(userId, postId);

    // User와 지정한 Post가 하나의 nested write에서 모두 수정됐는지 확인합니다.
    expect(user.displayName).toBe('수정된 사용자 이름');
    expect(user.posts).toEqual([
      expect.objectContaining({
        id: postId,
        title: 'nested update로 수정한 제목',
        published: true,
      }),
    ]);
  });

  it('조건에 맞는 여러 Post를 공개 상태로 수정한다', async () => {
    const result = await runUpdateMany(userId);
    // count뿐 아니라 실제 저장된 값도 확인하기 위해 다시 조회합니다.
    const posts = await prisma.post.findMany({ where: { authorId: userId } });

    expect(result.count).toBe(2);
    expect(posts.every((post) => post.published)).toBe(true);
  });

  it('여러 Post를 수정하고 변경된 결과를 반환한다', async () => {
    const posts = await runUpdateManyAndReturn(userId);

    // 반환된 모든 Post의 content와 중첩 author가 올바른지 검사합니다.
    expect(posts).toHaveLength(2);
    expect(
      posts.every(
        (post) =>
          post.content === 'updateManyAndReturn으로 일괄 수정한 내용입니다.',
      ),
    ).toBe(true);
    expect(posts.every((post) => post.author.id === userId)).toBe(true);
  });
});
