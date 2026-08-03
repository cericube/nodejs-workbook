import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runUpsertPostLike,
  runUpsertUser,
} from '../../src/ch03/upsert-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch03-upsert-test.local';

/**
 * upsert의 create/update 분기와 멱등성 있는 관계 생성을 검증합니다.
 */
describe('ch03 upsert 예제', () => {
  beforeAll(async () => {
    // 같은 unique email로 테스트를 반복 실행할 수 있도록 먼저 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('User가 없으면 생성하고 있으면 수정한다', async () => {
    const email = `user${EMAIL_DOMAIN}`;
    // 첫 호출은 create, 같은 email의 두 번째 호출은 update 분기로 진입합니다.
    const createdUser = await runUpsertUser(email);
    const updatedUser = await runUpsertUser(email);

    expect(createdUser.displayName).toBe('upsert로 생성된 사용자');
    expect(updatedUser.id).toBe(createdUser.id);
    expect(updatedUser.displayName).toBe('upsert로 수정된 사용자');
  });

  it('같은 PostLike를 여러 번 upsert해도 한 건만 유지한다', async () => {
    // 복합 키를 구성할 User와 Post를 준비합니다.
    const user = await prisma.user.create({
      data: { email: `like-user${EMAIL_DOMAIN}` },
    });
    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        posts: { create: { title: 'upsert 좋아요 대상' } },
      },
      include: { posts: true },
    });
    const post = author.posts[0];
    if (!post) {
      throw new Error('좋아요 대상 게시글을 생성하지 못했습니다.');
    }

    const firstResult = await runUpsertPostLike(user.id, post.id);
    const secondResult = await runUpsertPostLike(user.id, post.id);
    // 실제 중간 모델의 개수를 조회해 중복 생성 여부를 확인합니다.
    const count = await prisma.postLike.count({
      where: { userId: user.id, postId: post.id },
    });

    // 기존 행을 재사용했다면 생성 시각이 같고 DB에도 한 건만 존재합니다.
    expect(secondResult.createdAt).toEqual(firstResult.createdAt);
    expect(count).toBe(1);
  });
});
