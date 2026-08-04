import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runAllowedDynamicSort,
  runDynamicPostSearch,
} from '../../src/ch06/dynamic-query-composition-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch06-query-composition-test.local';

// 전체 Raw SQL 결과에서 이 테스트가 만든 레코드를 식별하기 위한 PK입니다.
let authorId: number;
let matchingPostId: number;
let newestPostId: number;
let secondNewestPostId: number;

/**
 * 선택적 Prisma.Sql 조건 조합과 허용 목록 기반 동적 정렬을 검증합니다.
 */
describe('ch06 동적 Raw SQL 조합', () => {
  /**
   * 선택적 필터와 정렬을 함께 검증할 Post를 한 User 아래에 생성합니다.
   * 정렬용 Post에는 미래 시각을 지정해 기존 데이터보다 먼저 조회되게 합니다.
   */
  beforeAll(async () => {
    // 이전 실행이 남긴 이 테스트 전용 데이터만 제거해 email 충돌을 방지합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: '동적 조합 작성자',
        posts: {
          create: [
            {
              title: 'Prisma Raw 공개 글',
              published: true,
            },
            {
              title: 'Prisma Raw 비공개 글',
              published: false,
            },
            {
              title: '가장 최신 정렬 글',
              published: true,
              createdAt: new Date('2100-01-02T00:00:00.000Z'),
            },
            {
              title: '두 번째 최신 정렬 글',
              published: true,
              createdAt: new Date('2100-01-01T00:00:00.000Z'),
            },
          ],
        },
      },
      include: { posts: true },
    });

    const matchingPost = author.posts.find((post) => post.title === 'Prisma Raw 비공개 글');
    const newestPost = author.posts.find((post) => post.title === '가장 최신 정렬 글');
    const secondNewestPost = author.posts.find((post) => post.title === '두 번째 최신 정렬 글');

    if (!matchingPost || !newestPost || !secondNewestPost) {
      throw new Error('동적 조합 테스트용 Post를 생성하지 못했습니다.');
    }

    authorId = author.id;
    matchingPostId = matchingPost.id;
    newestPostId = newestPost.id;
    secondNewestPostId = secondNewestPost.id;
  });

  afterAll(async () => {
    // User 삭제 시 연결된 Post도 Cascade로 함께 정리됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('전달된 선택적 조건을 AND로 연결해 일치하는 Post만 반환한다', async () => {
    const posts = await runDynamicPostSearch({
      authorId,
      published: false,
      keyword: 'Prisma Raw',
    });

    // 작성자, 비공개 여부와 제목 키워드를 모두 만족하는 한 건만 남아야 합니다.
    expect(posts.map((post) => post.id)).toEqual([matchingPostId]);
  });

  it('Prisma.empty를 사용해 조건 없이도 유효한 SQL을 실행한다', async () => {
    const posts = await runDynamicPostSearch({});

    expect(posts.some((post) => post.id === matchingPostId)).toBe(true);
  });

  it('허용한 createdAt 컬럼과 desc 방향으로 정렬한다', async () => {
    const posts = await runAllowedDynamicSort('createdAt', 'desc');

    // 미래 시각을 지정한 두 Post가 전체 결과의 첫 번째와 두 번째여야 합니다.
    expect(posts.slice(0, 2).map((post) => post.id)).toEqual([newestPostId, secondNewestPostId]);
  });

  it('허용 목록에 없는 컬럼과 정렬 방향을 거부한다', async () => {
    // 검증 단계에서 예외가 발생하므로 잘못된 식별자가 DB로 전달되지 않습니다.
    await expect(runAllowedDynamicSort('email', 'asc')).rejects.toThrow(
      '허용되지 않은 정렬 컬럼입니다.',
    );
    await expect(runAllowedDynamicSort('title', 'sideways')).rejects.toThrow(
      '정렬 방향은 asc 또는 desc만 사용할 수 있습니다.',
    );
  });
});
