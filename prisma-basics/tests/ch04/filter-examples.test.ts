import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runLogicalFilters,
  runNullFilters,
  runScalarFilters,
  runStringFilters,
} from '../../src/ch04/filter-examples';
import { prisma } from '../../src/shared/database';

// 테스트에서 생성한 User만 안전하게 찾아 정리하기 위한 전용 도메인입니다.
const EMAIL_DOMAIN = '@ch04-filter-test.local';
// 다른 게시글과 검색 결과가 겹치지 않게 고유한 검색어를 사용합니다.
const KEYWORD = 'ch04-filter-keyword';

/**
 * 스칼라, 문자열, null, 논리 필터가 의도한 레코드만 반환하는지 검증합니다.
 */
describe('ch04 스칼라 및 논리 필터', () => {
  beforeAll(async () => {
    // 이전 실행에서 남은 테스트 데이터를 지워 반복 실행을 보장합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    // 공개 글, 보관 글, null 본문의 초안을 만들어 각 필터 조건을 준비합니다.
    await prisma.user.create({
      data: {
        email: `cericube1${EMAIL_DOMAIN}`,
        displayName: 'cericube1',
        posts: {
          create: [
            {
              title: `${KEYWORD} 공개 게시글`,
              content: 'Prisma 필터 테스트 본문',
              published: true,
            },
            {
              title: `[보관] ${KEYWORD}`,
              content: '논리 필터에서 제외할 게시글',
              published: true,
            },
            {
              title: '본문이 없는 초안',
              content: null,
              published: false,
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // User를 삭제하면 연결된 Post도 cascade로 함께 삭제됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('Boolean과 Date 조건에 맞는 최근 공개 게시글을 반환한다', async () => {
    const posts = await runScalarFilters();
    // 함수 내부와 같은 기준으로 반환 날짜의 하한을 계산합니다.
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // 반환된 모든 레코드가 공개 상태이며 최근 30일 이내인지 확인합니다.
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.published)).toBe(true);
    expect(
      posts.every((post) => post.createdAt.getTime() >= thirtyDaysAgo),
    ).toBe(true);
  });

  it('문자열과 in 필터를 적용한다', async () => {
    const { posts, users } = await runStringFilters(KEYWORD, EMAIL_DOMAIN);

    // toContainEqual과 objectContaining으로 배열 안의 일부 필드만 비교합니다.
    expect(posts).toContainEqual(
      expect.objectContaining({ title: `${KEYWORD} 공개 게시글` }),
    );
    expect(users).toContainEqual(
      expect.objectContaining({ email: `cericube1${EMAIL_DOMAIN}` }),
    );
  });

  it('nullable 필드를 null 여부로 구분한다', async () => {
    const { postsWithoutContent, postsWithContent } = await runNullFilters();

    // null 필터 결과에 준비한 초안이 포함되고 두 결과가 섞이지 않아야 합니다.
    expect(postsWithoutContent).toContainEqual(
      expect.objectContaining({ title: '본문이 없는 초안' }),
    );
    expect(postsWithoutContent.every((post) => post.content === null)).toBe(true);
    expect(postsWithContent.every((post) => post.content !== null)).toBe(true);
  });

  it('AND, OR, NOT 조건을 함께 적용한다', async () => {
    const posts = await runLogicalFilters(KEYWORD);

    // 검색어를 포함한 공개 글은 남고 [보관] 제목은 모두 제외돼야 합니다.
    expect(posts).toContainEqual(
      expect.objectContaining({ title: `${KEYWORD} 공개 게시글` }),
    );
    expect(posts.every((post) => post.published)).toBe(true);
    expect(posts.every((post) => !post.title.includes('[보관]'))).toBe(true);
  });
});
