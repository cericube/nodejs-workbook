import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSelectAndInclude } from '../../src/ch04/select-include-examples';
import { prisma } from '../../src/shared/database';

const EMAIL = 'user@ch04-select-include-test.local';

/**
 * select와 include가 만드는 반환 객체의 필드 차이를 검증합니다.
 */
describe('ch04 select와 include', () => {
  beforeAll(async () => {
    // 고유 이메일 충돌을 막고 테스트용 User와 Post 네 건을 준비합니다.
    await prisma.user.deleteMany({ where: { email: EMAIL } });

    await prisma.user.create({
      data: {
        email: EMAIL,
        displayName: 'select/include 테스트 사용자',
        posts: {
          create: Array.from({ length: 4 }, (_, index) => ({
            title: `선택 테스트 게시글 ${index + 1}`,
            // 정렬 결과를 예측할 수 있도록 생성 시각을 1초씩 다르게 지정합니다.
            createdAt: new Date(Date.now() - index * 1_000),
          })),
        },
      },
    });
  });

  afterAll(async () => {
    // User 삭제로 연결된 Post까지 함께 정리합니다.
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it('select는 지정 필드만, include는 기본 필드와 관계를 반환한다', async () => {
    const { selectedUser, includedUser } = await runSelectAndInclude(EMAIL);

    // 아래에서 속성에 접근하기 전에 두 조회가 성공했음을 검증합니다.
    expect(selectedUser).not.toBeNull();
    expect(includedUser).not.toBeNull();

    if (!selectedUser || !includedUser) {
      throw new Error('테스트 사용자를 조회하지 못했습니다.');
    }

    // select 결과에는 명시한 세 필드만 있어야 합니다.
    expect(Object.keys(selectedUser).sort()).toEqual([
      'displayName',
      'id',
      'posts',
    ]);
    // include 결과는 User 기본 스칼라 필드를 유지합니다.
    expect(includedUser).toHaveProperty('email');
    expect(includedUser).toHaveProperty('createdAt');
    // 관계 내부의 take와 최신순 orderBy도 함께 검증합니다.
    expect(selectedUser.posts).toHaveLength(3);
    expect(includedUser.posts).toHaveLength(3);
    expect(selectedUser.posts[0]?.title).toBe('선택 테스트 게시글 1');
  });

  it('고유 조건과 일치하는 사용자가 없으면 null을 반환한다', async () => {
    const result = await runSelectAndInclude(
      'missing@ch04-select-include-test.local',
    );

    // findUnique는 대상이 없을 때 예외 대신 null을 반환합니다.
    expect(result.selectedUser).toBeNull();
    expect(result.includedUser).toBeNull();
  });
});
