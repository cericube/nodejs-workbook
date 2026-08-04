import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../shared/database';

/**
 * 필터 조회에서 선택한 DB 컬럼과 일치하는 Raw SQL 결과 타입입니다.
 */
export type FilteredPostRow = {
  id: number;
  title: string;
  content: string | null;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorId: number;
};

/**
 * 1) Prisma.sql: 값이 포함된 안전한 SQL 조건 조각 생성
 *
 * 작성자와 공개 여부를 실행 시점에 받아 WHERE 조건을 만듭니다.
 * 문자열 연결 없이 SQL 조각을 구성해야 각 값의 파라미터 바인딩이 유지됩니다.
 */
export async function runSafeDynamicFilter(authorId: number, published: boolean) {
  console.log('--- [1] Prisma.sql 안전한 동적 필터 조회 ---');

  // Prisma.sql은 실행 결과가 아니라 다른 Raw SQL에 삽입할 수 있는 SQL 조각을
  // 만듭니다. 조각 안의 두 변수도 Prepared Statement 값으로 바인딩됩니다.
  const condition = Prisma.sql`
    p.author_id = ${authorId}
    AND p.published = ${published}
  `;

  // 조건 조각 전체를 WHERE 뒤에 삽입하되 조각 안의 값은 각각 바인딩됩니다.
  // SELECT * 대신 필요한 컬럼을 명시해 결과 형태가 스키마 변경에 덜 의존하게 합니다.
  const posts = await prisma.$queryRaw<FilteredPostRow[]>`
    SELECT
      p.id,
      p.title,
      p.content,
      p.published,
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",
      p.author_id AS "authorId"
    FROM study.posts AS p
    WHERE ${condition}
    ORDER BY p.created_at DESC, p.id DESC
  `;

  // Raw SQL의 제네릭은 컴파일 단계의 타입 힌트일 뿐 런타임 검증을 하지 않습니다.
  // snake_case 컬럼에는 SELECT 별칭을 지정해 결과 타입의 이름과 맞춥니다.
  console.dir(posts, { depth: null });
  return posts;
}
