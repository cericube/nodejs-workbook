import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../shared/database';

/**
 * 실행할 때 선택적으로 전달할 수 있는 게시글 검색 조건입니다.
 * 프로퍼티가 없으면 해당 조건은 최종 WHERE 절에 추가되지 않습니다.
 */
export type PostSearchFilters = {
  authorId?: number;
  published?: boolean;
  keyword?: string;
};

/**
 * 동적 검색과 정렬 Raw SQL이 공통으로 반환하는 한 행의 타입입니다.
 */
export type PostSearchRow = {
  id: number;
  title: string;
  published: boolean;
  authorId: number;
  createdAt: Date;
};

/**
 * 1) Prisma.join과 Prisma.empty: 선택적 검색 조건 조합
 *
 * 전달된 필터만 WHERE 절에 추가합니다. 조건이 하나도 없을 때는
 * Prisma.empty를 사용해 유효한 SQL을 유지합니다.
 */
export async function runDynamicPostSearch(filters: PostSearchFilters) {
  console.log('--- [1] 선택적 Raw SQL 검색 조건 조합 ---');

  // 각 필터를 문자열이 아닌 Prisma.Sql 조각으로 누적해야 조합한 뒤에도
  // `${value}`의 파라미터 바인딩이 그대로 유지됩니다.
  const conditions: Prisma.Sql[] = [];

  if (filters.authorId !== undefined) {
    conditions.push(Prisma.sql`p.author_id = ${filters.authorId}`);
  }

  // false도 검색에 사용하는 유효한 값이므로 truthy 검사가 아니라
  // undefined 여부를 확인합니다.
  if (filters.published !== undefined) {
    conditions.push(Prisma.sql`p.published = ${filters.published}`);
  }

  if (filters.keyword !== undefined && filters.keyword.length > 0) {
    // 검색어 앞뒤의 %는 PostgreSQL ILIKE 부분 검색 패턴입니다.
    // 완성된 pattern도 SQL 문자열이 아니라 하나의 값으로 바인딩됩니다.
    const pattern = `%${filters.keyword}%`;
    conditions.push(Prisma.sql`p.title ILIKE ${pattern}`);
  }

  // Prisma.join은 각 SQL 조각을 AND로 연결합니다. 조건이 없으면
  // Prisma.empty가 아무 SQL도 추가하지 않으므로 전체 Post를 조회합니다.
  const whereClause =
    conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

  // 완성된 whereClause는 SQL 문자열이 아니라 바인딩 정보를 포함한 SQL 조각입니다.
  // $queryRaw에 삽입해도 각 조건의 값이 SQL 명령으로 해석되지 않습니다.
  const posts = await prisma.$queryRaw<PostSearchRow[]>`
    SELECT
      p.id,
      p.title,
      p.published,
      p.author_id AS "authorId",
      p.created_at AS "createdAt"
    FROM study.posts AS p
    ${whereClause}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 20
  `;

  console.dir(posts, { depth: null });
  return posts;
}

const SORT_COLUMNS = {
  title: 'p.title',
  createdAt: 'p.created_at',
} as const;

// 허용 목록 객체의 키에서 정렬 컬럼 타입을 만들어 목록과 타입을 함께 유지합니다.
export type PostSortColumn = keyof typeof SORT_COLUMNS;
export type SortDirection = 'asc' | 'desc';

/**
 * 2) Prisma.raw와 허용 목록: 동적 식별자로 게시글 정렬
 *
 * 컬럼명과 ASC/DESC 같은 SQL 식별자·키워드는 값으로 바인딩할 수 없습니다.
 * 외부 입력을 허용 목록으로 검증한 뒤 고정된 SQL 문자열만 사용해야 합니다.
 */
export async function runAllowedDynamicSort(sortBy: string, direction: string) {
  console.log('--- [2] 허용 목록 기반 Raw SQL 정렬 ---');

  // 함수 경계에서는 외부 입력을 받을 수 있도록 string으로 받고,
  // SQL 조각을 만들기 전에 허용한 컬럼과 방향인지 런타임에 검증합니다.
  if (!Object.hasOwn(SORT_COLUMNS, sortBy)) {
    throw new Error('허용되지 않은 정렬 컬럼입니다.');
  }

  if (direction !== 'asc' && direction !== 'desc') {
    throw new Error('정렬 방향은 asc 또는 desc만 사용할 수 있습니다.');
  }

  // 검증된 키로 내부 상수만 선택하므로 외부 문자열이 SQL에 직접 들어가지 않습니다.
  // Prisma.raw는 내용을 그대로 삽입하므로 검증되지 않은 입력에는 사용하면 안 됩니다.
  const sortColumn = Prisma.raw(SORT_COLUMNS[sortBy as PostSortColumn]);
  const sortDirection = Prisma.raw(direction.toUpperCase());

  // 컬럼과 정렬 방향은 바인딩할 수 없어 검증된 Prisma.raw 조각을 사용하고,
  // 같은 값의 정렬 순서를 안정적으로 유지하도록 id를 보조 정렬 기준으로 둡니다.
  const posts = await prisma.$queryRaw<PostSearchRow[]>`
    SELECT
      p.id,
      p.title,
      p.published,
      p.author_id AS "authorId",
      p.created_at AS "createdAt"
    FROM study.posts AS p
    ORDER BY ${sortColumn} ${sortDirection}, p.id DESC
    LIMIT 20
  `;

  console.dir(posts, { depth: null });
  return posts;
}
