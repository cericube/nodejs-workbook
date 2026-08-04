import { prisma } from '../shared/database';

/**
 * 1) $executeRaw: 특정 작성자의 공개 게시글 일괄 비공개 처리
 *
 * UPDATE, DELETE처럼 행을 변경하는 Raw SQL에 사용합니다. 조회된 레코드가
 * 아니라 SQL의 영향을 받은 행 개수를 number로 반환합니다.
 */
export async function runExecuteRawUnpublishByAuthor(authorId: number) {
  console.log('--- [1] $executeRaw 게시글 일괄 비공개 처리 ---');

  // Tagged Template Literal의 `${authorId}`는 값 파라미터로 안전하게
  // 바인딩됩니다. 이미 비공개인 Post는 변경 대상에서 제외합니다.
  // Raw SQL은 Prisma의 @updatedAt 처리를 거치지 않으므로 updated_at도 직접 갱신합니다.
  const affectedCount = await prisma.$executeRaw`
    UPDATE study.posts
    SET
      published = FALSE,
      updated_at = NOW()
    WHERE author_id = ${authorId}
      AND published = TRUE
  `;

  console.log(`비공개로 변경된 게시글 수: ${affectedCount}개`);
  return affectedCount;
}

/**
 * 2) $transaction과 $executeRaw: 사용자와 게시글을 함께 변경
 *
 * 표시 이름 변경과 게시글 비공개 처리가 모두 성공해야 할 때 사용합니다.
 * 배열 트랜잭션 안의 쿼리 하나라도 실패하면 전체 작업이 롤백됩니다.
 */
export async function runExecuteRawTransaction(userId: number, displayName: string) {
  console.log('--- [2] $executeRaw 트랜잭션 실행 ---');

  // 각 $executeRaw는 변경 행 개수를 반환하므로 트랜잭션 결과는
  // [User 변경 건수, Post 변경 건수] 형태의 튜플로 받을 수 있습니다.
  // 배열에 전달한 순서대로 실행되며 두 결과도 같은 순서로 반환됩니다.
  const [updatedUserCount, unpublishedPostCount] = await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE study.users
      SET display_name = ${displayName}
      WHERE id = ${userId}
    `,
    prisma.$executeRaw`
      UPDATE study.posts
      SET
        published = FALSE,
        updated_at = NOW()
      WHERE author_id = ${userId}
        AND published = TRUE
    `,
  ]);

  const result = {
    updatedUserCount,
    unpublishedPostCount,
  };

  console.log(result);
  return result;
}
