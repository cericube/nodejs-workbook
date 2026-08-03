import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runFindFirst,
  runFindFirstOrThrow,
  runFindMany,
  runFindUnique,
  runFindUniqueOrThrow,
} from '../../src/ch03/read-examples';
import { prisma } from '../../src/shared/database';

const EMAIL = 'user@ch03-read-test.local';
// 다른 데이터와 겹치지 않는 검색어를 사용해 검색 결과를 식별합니다.
const KEYWORD = 'ch03-read-keyword';

let userId: number;
let publishedPostId: number;

/**
 * 단건 조회, OrThrow 조회, 조건 조회와 목록 조회의 반환 형태를 검증합니다.
 */
describe('ch03 read 예제', () => {
  beforeAll(async () => {
    // 테스트 스위트 전체에서 공유할 User와 공개/비공개 Post를 준비합니다.
    await prisma.user.deleteMany({ where: { email: EMAIL } });

    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        displayName: '조회 테스트 사용자',
        posts: {
          create: [
            {
              title: `${KEYWORD} 공개 게시글`,
              content: '조회할 본문',
              published: true,
            },
            { title: '조회 테스트 초안', published: false },
          ],
        },
      },
      include: { posts: { orderBy: { id: 'asc' } } },
    });

    const publishedPost = user.posts.find((post) => post.published);
    // 아래 테스트에서 number id를 안전하게 사용하기 위한 존재 검사입니다.
    if (!publishedPost) {
      throw new Error('조회 테스트 게시글을 생성하지 못했습니다.');
    }

    userId = user.id;
    publishedPostId = publishedPost.id;
    // findUniqueOrThrow의 _count 검증을 위해 좋아요 한 건을 연결합니다.
    await prisma.postLike.create({
      data: { userId, postId: publishedPostId },
    });
  });

  afterAll(async () => {
    // User 삭제의 cascade를 이용해 연결된 Post와 PostLike까지 제거합니다.
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it('고유 이메일로 User를 조회하고 없으면 null을 반환한다', async () => {
    // resolves는 Promise가 성공하고 지정한 객체 형태를 반환하는지 검사합니다.
    await expect(runFindUnique(EMAIL)).resolves.toMatchObject({
      id: userId,
      email: EMAIL,
    });
    await expect(runFindUnique('missing@ch03-read-test.local')).resolves.toBeNull();
  });

  it('Post 한 건과 작성자 및 좋아요 개수를 조회한다', async () => {
    const post = await runFindUniqueOrThrow(publishedPostId);

    // include로 가져온 작성자와 _count 결과를 함께 확인합니다.
    expect(post.author.id).toBe(userId);
    expect(post._count.likes).toBe(1);
    // 존재하지 않는 고유 키는 Prisma의 P2025 오류를 발생시켜야 합니다.
    await expect(runFindUniqueOrThrow(-1)).rejects.toMatchObject({ code: 'P2025' });
  });

  it('작성자의 공개 게시글 중 첫 번째 결과를 조회한다', async () => {
    const post = await runFindFirst(userId);

    expect(post).toMatchObject({ id: publishedPostId });
    expect(post?.author.id).toBe(userId);
  });

  it('검색어가 포함된 공개 게시글을 조회한다', async () => {
    // 대문자로 전달해 insensitive 문자열 필터도 함께 확인합니다.
    const post = await runFindFirstOrThrow(KEYWORD.toUpperCase());

    expect(post.id).toBe(publishedPostId);
    await expect(runFindFirstOrThrow('존재하지-않는-검색어')).rejects.toMatchObject({
      code: 'P2025',
    });
  });

  it('공개 게시글을 페이지 크기에 맞춰 조회한다', async () => {
    const posts = await runFindMany(1, 2);

    // 전체 DB 상태와 무관하게 페이지 크기, 공개 조건, 반환 관계를 검증합니다.
    expect(posts.length).toBeLessThanOrEqual(2);
    expect(posts.every((post) => post.published)).toBe(true);
    expect(posts.every((post) => 'author' in post && '_count' in post)).toBe(true);
  });
});
