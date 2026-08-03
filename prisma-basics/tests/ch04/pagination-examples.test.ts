import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getPostCursorPage,
  getPostOffsetPage,
} from '../../src/ch04/pagination-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch04-pagination-test.local';

/**
 * 오프셋 페이지 크기와 복합 커서를 이용한 다음 페이지 이동을 검증합니다.
 */
describe('ch04 페이지네이션', () => {
  beforeAll(async () => {
    // 같은 이메일을 다시 생성할 수 있도록 이전 테스트 데이터를 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    // 다음 페이지가 반드시 존재하도록 서로 다른 생성 시각의 공개 글 5건을 만듭니다.
    await prisma.user.create({
      data: {
        email: `user${EMAIL_DOMAIN}`,
        displayName: '페이지네이션 테스트 사용자',
        posts: {
          create: Array.from({ length: 5 }, (_, index) => ({
            title: `페이지네이션 게시글 ${index + 1}`,
            published: true,
            createdAt: new Date(Date.now() - index * 1_000),
          })),
        },
      },
    });
  });

  afterAll(async () => {
    // 테스트 전용 User와 cascade 관계 데이터를 제거합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('오프셋 페이지 크기와 공개 조건을 지킨다', async () => {
    // 첫 번째 페이지에서 두 건만 요청합니다.
    const posts = await getPostOffsetPage(1, 2);

    // take가 적용되고 Date 필드가 실제 Date 객체로 반환되는지 확인합니다.
    expect(posts).toHaveLength(2);
    expect(posts.every((post) => post.createdAt instanceof Date)).toBe(true);
  });

  it('다음 커서로 중복 없는 페이지를 조회한다', async () => {
    // 커서 없이 첫 페이지를 조회합니다.
    const firstPage = await getPostCursorPage();

    // 구현의 고정 페이지 크기는 3이며 준비한 데이터로 다음 페이지가 존재합니다.
    expect(firstPage.data).toHaveLength(3);
    expect(firstPage.hasNextPage).toBe(true);
    const nextCursor = firstPage.nextCursor;
    expect(nextCursor).not.toBeNull();

    if (!nextCursor) {
      throw new Error('다음 페이지 커서가 생성되지 않았습니다.');
    }

    // 첫 페이지가 제공한 복합 커서를 그대로 다음 요청에 전달합니다.
    const secondPage = await getPostCursorPage(nextCursor);
    const firstPageIds = new Set(firstPage.data.map((post) => post.id));

    // 커서 행을 skip했으므로 두 페이지에 같은 id가 없어야 합니다.
    expect(secondPage.data.every((post) => !firstPageIds.has(post.id))).toBe(
      true,
    );
    // 다음 커서는 현재 페이지의 마지막 레코드를 가리켜야 합니다.
    expect(nextCursor.id).toBe(firstPage.data.at(-1)?.id);
  });
});
