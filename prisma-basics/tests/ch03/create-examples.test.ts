import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runCreate,
  runCreateMany,
  runCreateManyAndReturn,
  runCreatePostLike,
  runCreateWithConnect,
  runNestedCreate,
} from '../../src/ch03/create-examples';
import { prisma } from '../../src/shared/database';

// 운영 데이터와 구분되는 전용 도메인으로 테스트 데이터의 범위를 제한합니다.
const EMAIL_DOMAIN = '@ch03-create-test.local';

/**
 * create 계열 함수가 레코드와 관계를 의도한 형태로 생성하는지 검증합니다.
 * 이 파일은 실제 테스트 DB를 사용하는 통합 테스트입니다.
 */
describe('ch03 create 예제', () => {
  beforeAll(async () => {
    // 이전 테스트가 비정상 종료되어 데이터가 남아 있어도 unique 충돌이 없게 합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    // User 삭제 시 Post와 PostLike도 cascade로 함께 정리됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('User 한 건을 생성한다', async () => {
    const email = `single${EMAIL_DOMAIN}`;

    // 테스트 대상 함수를 실행합니다.
    const user = await runCreate(email);

    // toMatchObject는 반환 객체 중 관심 있는 필드만 부분 비교합니다.
    expect(user).toMatchObject({ email, displayName: 'cericube1' });
    expect(user.id).toBeGreaterThan(0);
  });

  it('User와 연결된 Post를 nested create로 생성한다', async () => {
    const user = await runNestedCreate(`nested${EMAIL_DOMAIN}`);

    // Post 두 건이 생성되고 모두 새 User의 외래 키를 갖는지 확인합니다.
    expect(user.posts).toHaveLength(2);
    expect(user.posts.every((post) => post.authorId === user.id)).toBe(true);
    expect(user.posts).toContainEqual(
      expect.objectContaining({
        title: 'nested create 게시글 1',
        published: true,
      }),
    );
  });

  it('여러 User를 생성하고 선택한 필드를 반환한다', async () => {
    const emails = [`many-1${EMAIL_DOMAIN}`, `many-2${EMAIL_DOMAIN}`] as const;
    const users = await runCreateManyAndReturn(emails);

    // 생성 순서에 의존하지 않도록 이메일을 정렬한 뒤 비교합니다.
    expect(users).toHaveLength(2);
    expect(users.map((user) => user.email).sort()).toEqual([...emails].sort());
    expect(users.every((user) => Object.keys(user).length === 2)).toBe(true);
  });

  it('기존 User를 작성자로 연결해 Post를 생성한다', async () => {
    // connect 대상이 될 User를 먼저 준비합니다.
    const author = await prisma.user.create({
      data: { email: `connect${EMAIL_DOMAIN}` },
    });

    const post = await runCreateWithConnect(author.email);

    expect(post.author.id).toBe(author.id);
    expect(post.author.email).toBe(author.email);
  });

  it('같은 작성자의 Post 여러 건을 생성한다', async () => {
    const author = await prisma.user.create({
      data: { email: `post-many${EMAIL_DOMAIN}` },
    });

    const result = await runCreateMany(author.id);
    // createMany는 객체 대신 count만 반환하므로 DB도 다시 조회합니다.
    const posts = await prisma.post.findMany({ where: { authorId: author.id } });

    expect(result.count).toBe(2);
    expect(posts).toHaveLength(2);
  });

  it('User와 Post 사이에 명시적 다대다 관계를 생성한다', async () => {
    // 좋아요를 누를 User와 좋아요 대상 Post의 작성자를 각각 생성합니다.
    const user = await prisma.user.create({
      data: { email: `like-user${EMAIL_DOMAIN}` },
    });
    const author = await prisma.user.create({
      data: {
        email: `like-author${EMAIL_DOMAIN}`,
        posts: { create: { title: '좋아요 대상 게시글' } },
      },
      include: { posts: true },
    });
    const post = author.posts[0];

    expect(post).toBeDefined();
    // 타입 검사에서도 post의 존재를 보장하기 위한 런타임 가드입니다.
    if (!post) {
      throw new Error('좋아요 대상 게시글을 생성하지 못했습니다.');
    }

    const postLike = await runCreatePostLike(user.id, post.id);

    // 생성된 중간 모델이 준비한 User와 Post 양쪽을 가리키는지 검증합니다.
    expect(postLike.user.id).toBe(user.id);
    expect(postLike.post.id).toBe(post.id);
  });
});
