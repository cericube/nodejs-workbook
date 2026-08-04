import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../shared/database';

/**
 * 다음 페이지의 시작 위치를 결정하는 마지막 Post의 정렬 키입니다.
 */
export type RawPostCursor = {
  createdAt: Date;
  id: number;
};

/**
 * 공개 여부, 페이지 크기와 선택적 커서를 받는 조회 인자입니다.
 */
export type RawPostPageParams = {
  published?: boolean;
  take?: number;
  cursor?: RawPostCursor;
};

/**
 * Raw SQL 페이지 조회가 반환하는 Post 필드의 형태입니다.
 */
export type RawPostPageRow = {
  id: number;
  title: string;
  published: boolean;
  createdAt: Date;
  authorId: number;
};

/**
 * Raw SQL 키셋 페이지네이션의 페이지 크기를 검증합니다.
 *
 * SQL Injection은 파라미터 바인딩으로 방지되지만, 음수나 과도한 LIMIT 같은
 * 유효하지 않은 입력은 별도의 애플리케이션 검증이 필요합니다.
 */
function validateTake(take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 100) {
    throw new RangeError('take는 1 이상 100 이하의 정수여야 합니다.');
  }
}

/**
 * 1) Raw SQL 복합 커서 기반 키셋 페이지네이션
 *
 * Post 스키마의 @@unique([createdAt, id])와 같은 순서로 정렬하고 마지막 행의
 * 두 값을 다음 조회 조건에 사용합니다. 데이터가 많아져도 큰 OFFSET을 건너뛰지
 * 않아도 되는 페이지네이션 방식입니다.
 */
export async function runRawKeysetPagination({
  published,
  take = 20,
  cursor,
}: RawPostPageParams = {}) {
  console.log('--- [1] Raw SQL 키셋 페이지네이션 ---');

  validateTake(take);

  // 필터가 없으면 빈 SQL 조각을 넣고, false가 전달된 경우도 조건에 포함되도록
  // undefined와 직접 비교합니다.
  const publishedFilter =
    published === undefined ? Prisma.empty : Prisma.sql`AND p.published = ${published}`;

  // 첫 페이지에는 커서 조건이 없습니다. 다음 페이지부터 직전 페이지의 마지막
  // (createdAt, id)보다 작은 행을 조회해 중복 없이 다음 구간으로 이동합니다.
  const cursorFilter = cursor
    ? Prisma.sql`
        AND (p.created_at, p.id) < (${cursor.createdAt}, ${cursor.id})
      `
    : Prisma.empty;

  // WHERE TRUE를 고정하면 선택적 조건을 모두 AND 조각으로 통일할 수 있습니다.
  // LIMIT의 take도 값으로 바인딩되며, 위의 validateTake가 허용 범위를 제한합니다.
  const posts = await prisma.$queryRaw<RawPostPageRow[]>`
    SELECT
      p.id,
      p.title,
      p.published,
      p.created_at AS "createdAt",
      p.author_id AS "authorId"
    FROM study.posts AS p
    WHERE TRUE
      ${publishedFilter}
      ${cursorFilter}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${take}
  `;

  // 다음 호출에 전달할 커서는 현재 페이지의 마지막 행에서 만듭니다.
  // 결과가 비어 있으면 다음 페이지가 없으므로 undefined를 반환합니다.
  const lastPost = posts.at(-1);
  const nextCursor = lastPost ? { createdAt: lastPost.createdAt, id: lastPost.id } : undefined;

  const result = {
    posts,
    nextCursor,
  };

  console.dir(result, { depth: null });
  return result;
}
