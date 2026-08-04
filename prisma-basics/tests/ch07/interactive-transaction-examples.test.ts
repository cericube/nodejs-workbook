import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  runInteractiveCreateUserWithPost,
  runPublishPostSafely,
} from '../../src/ch07/interactive-transaction-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_PREFIX = 'ch07-interactive-';

// 반복 테스트에서 같은 Post의 공개 전후 상태를 조회하기 위한 PK입니다.
let draftPostId: number;

/**
 * 대화형 트랜잭션의 의존 작업, 비즈니스 규칙 롤백과 조건 분기를 검증합니다.
 */
describe('ch07 대화형 트랜잭션', () => {
  /**
   * 정책 검사와 User→Post 의존 생성을 위한 User, 공개 조건 분기용 Post를 준비합니다.
   */
  beforeAll(async () => {
    // 테스트 전용 prefix만 사용해 다른 장의 User 데이터와 격리합니다.
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });

    // Post 공개 예제가 매 테스트에서 같은 초기 상태를 사용할 수 있도록 준비합니다.
    const publisher = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}publisher@example.com`,
        displayName: '게시글 작성자',
        posts: {
          create: {
            title: '공개 전 게시글',
            published: false,
          },
        },
      },
      include: { posts: true },
    });

    const draftPost = publisher.posts[0];
    if (!draftPost) {
      throw new Error('대화형 트랜잭션 테스트용 Post를 생성하지 못했습니다.');
    }
    draftPostId = draftPost.id;
  });

  beforeEach(async () => {
    // 이전 테스트가 공개한 Post를 비공개 상태와 원래 제목으로 되돌립니다.
    await prisma.post.update({
      where: { id: draftPostId },
      data: {
        title: '공개 전 게시글',
        published: false,
      },
    });
  });

  afterAll(async () => {
    // User 삭제의 Cascade로 테스트에서 생성한 Post도 함께 정리됩니다.
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
    await prisma.$disconnect();
  });

  it('허용된 이메일의 User와 해당 id를 사용하는 Post를 함께 커밋한다', async () => {
    const email = `${EMAIL_PREFIX}success@example.com`;
    const result = await runInteractiveCreateUserWithPost(email, '대화형 트랜잭션 게시글');

    expect(result.user.email).toBe(email);
    expect(result.post.authorId).toBe(result.user.id);

    // 함수 반환값 외에도 실제 커밋된 관계를 include로 다시 조회합니다.
    const savedUser = await prisma.user.findUnique({
      where: { email },
      include: { posts: true },
    });
    expect(savedUser?.posts).toHaveLength(1);
  });

  it('허용되지 않은 이메일이면 먼저 생성한 User까지 롤백한다', async () => {
    const email = `${EMAIL_PREFIX}rollback@invalid.local`;

    await expect(
      runInteractiveCreateUserWithPost(email, '생성되면 안 되는 게시글'),
    ).rejects.toThrow('example.com 도메인 이메일만 가입할 수 있습니다.');

    // 정책 오류 전에 INSERT가 실행됐지만 콜백 오류로 User가 남지 않아야 합니다.
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });

  it('비공개 Post를 조회한 뒤 제목과 공개 상태를 함께 변경한다', async () => {
    const post = await runPublishPostSafely(draftPostId);

    expect(post).toMatchObject({
      id: draftPostId,
      title: '[공개] 공개 전 게시글',
      published: true,
    });
  });

  it('이미 공개된 Post는 변경하지 않고 비즈니스 오류를 반환한다', async () => {
    await prisma.post.update({
      where: { id: draftPostId },
      data: { published: true },
    });

    await expect(runPublishPostSafely(draftPostId)).rejects.toThrow('ALREADY_PUBLISHED_POST');

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: draftPostId },
    });
    expect(post.title).toBe('공개 전 게시글');
  });

  it('존재하지 않는 Post는 POST_NOT_FOUND 오류로 중단한다', async () => {
    // 스키마의 자동 증가 PK로 생성되지 않는 음수를 사용해 미존재 조건을 만듭니다.
    await expect(runPublishPostSafely(-1)).rejects.toThrow('POST_NOT_FOUND');
  });
});
