import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runRawKeysetPagination } from '../../src/ch06/raw-keyset-pagination-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch06-raw-pagination-test.local';

// createdAt 내림차순으로 정리된 공개 Post id와 필터 제외 대상을 저장합니다.
let publishedPostIds: number[];
let draftPostId: number;

/**
 * 복합 커서의 정렬 순서, 다음 페이지 이동과 페이지 크기 검증을 확인합니다.
 */
describe('ch06 Raw SQL 키셋 페이지네이션', () => {
  /**
   * 커서 이동 순서를 예측할 수 있도록 createdAt이 서로 다른 공개 글 다섯 건과
   * published 필터 확인용 비공개 글 한 건을 생성합니다.
   */
  beforeAll(async () => {
    // 테스트 전용 User를 먼저 정리해 반복 실행 시 unique 충돌을 방지합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    const author = await prisma.user.create({
      data: {
        email: `author${EMAIL_DOMAIN}`,
        displayName: 'Raw 페이지네이션 작성자',
        posts: {
          create: [
            {
              title: '페이지 공개 글 1',
              published: true,
              createdAt: new Date('2110-01-05T00:00:00.000Z'),
            },
            {
              title: '페이지 공개 글 2',
              published: true,
              createdAt: new Date('2110-01-04T00:00:00.000Z'),
            },
            {
              title: '페이지 공개 글 3',
              published: true,
              createdAt: new Date('2110-01-03T00:00:00.000Z'),
            },
            {
              title: '페이지 공개 글 4',
              published: true,
              createdAt: new Date('2110-01-02T00:00:00.000Z'),
            },
            {
              title: '페이지 공개 글 5',
              published: true,
              createdAt: new Date('2110-01-01T00:00:00.000Z'),
            },
            {
              title: '페이지 비공개 글',
              published: false,
              createdAt: new Date('2110-01-06T00:00:00.000Z'),
            },
          ],
        },
      },
      include: {
        posts: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    publishedPostIds = author.posts.filter((post) => post.published).map((post) => post.id);

    const draftPost = author.posts.find((post) => !post.published);

    if (publishedPostIds.length !== 5 || !draftPost) {
      throw new Error('Raw 페이지네이션 테스트용 Post를 생성하지 못했습니다.');
    }

    draftPostId = draftPost.id;
  });

  afterAll(async () => {
    // User를 삭제하면 생성한 모든 페이지네이션용 Post도 함께 삭제됩니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('복합 커서로 중복 없이 다음 공개 Post 페이지를 조회한다', async () => {
    // 첫 페이지는 커서 없이 시작하며 최신 공개 글 두 건을 가져옵니다.
    const firstPage = await runRawKeysetPagination({
      published: true,
      take: 2,
    });

    expect(firstPage.posts.map((post) => post.id)).toEqual(publishedPostIds.slice(0, 2));
    expect(firstPage.posts.some((post) => post.id === draftPostId)).toBe(false);
    expect(firstPage.nextCursor).toEqual({
      createdAt: firstPage.posts[1]?.createdAt,
      id: publishedPostIds[1],
    });

    if (!firstPage.nextCursor) {
      throw new Error('첫 페이지에서 다음 페이지 커서를 생성하지 못했습니다.');
    }

    // 첫 페이지의 마지막 (createdAt, id)를 다음 조회의 배타적 경계로 사용합니다.
    const secondPage = await runRawKeysetPagination({
      published: true,
      take: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.posts.map((post) => post.id)).toEqual(publishedPostIds.slice(2, 4));
    expect(secondPage.posts.map((post) => post.id)).not.toContain(publishedPostIds[0]);
  });

  it('범위를 벗어나거나 정수가 아닌 take를 거부한다', async () => {
    // 입력 검증에서 실패하므로 세 호출 모두 Raw SQL을 실행하기 전에 종료됩니다.
    await expect(runRawKeysetPagination({ take: 0 })).rejects.toThrow(
      'take는 1 이상 100 이하의 정수여야 합니다.',
    );
    await expect(runRawKeysetPagination({ take: 1.5 })).rejects.toThrow(
      'take는 1 이상 100 이하의 정수여야 합니다.',
    );
    await expect(runRawKeysetPagination({ take: 101 })).rejects.toThrow(
      'take는 1 이상 100 이하의 정수여야 합니다.',
    );
  });
});
