import { prisma } from '../shared/database';

/**
 * 게시글 통계 Raw SQL이 반환하는 한 행의 타입입니다.
 *
 * Raw SQL의 별칭은 Prisma 스키마의 필드 매핑을 자동으로 적용받지 않으므로
 * SELECT의 별칭과 이 타입의 프로퍼티 이름을 직접 일치시켜야 합니다.
 */
export type PostStatisticsRow = {
  postId: number;
  title: string;
  authorName: string | null;
  likeCount: number;
  createdAt: Date;
};

/**
 * 1) $queryRaw: 게시글, 작성자와 좋아요 통계 조회
 *
 * Prisma 모델 API보다 SQL의 JOIN과 집계 표현이 더 직접적인 경우 사용하는
 * 조회 예제입니다. 조회 결과가 없으면 예외 대신 빈 배열을 반환합니다.
 */
export async function runQueryRawPostStatistics() {
  console.log('--- [1] $queryRaw 게시글 통계 조회 ---');

  // $queryRaw 뒤에 백틱을 붙이는 Tagged Template Literal 방식을 사용합니다.
  // SQL을 직접 실행하므로 테이블과 컬럼에는 실제 DB 이름을 작성해야 합니다.
  // INNER JOIN은 작성자를 연결하고, LEFT JOIN은 좋아요가 없는 Post도 포함합니다.
  const posts = await prisma.$queryRaw<PostStatisticsRow[]>`
    SELECT
      p.id AS "postId",
      p.title,
      u.display_name AS "authorName",
      COUNT(pl.user_id)::int AS "likeCount",
      p.created_at AS "createdAt"
    FROM study.posts AS p
    INNER JOIN study.users AS u ON u.id = p.author_id
    LEFT JOIN study.post_likes AS pl ON pl.post_id = p.id
    GROUP BY p.id, p.title, p.created_at, u.display_name
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 10
  `;

  // PostgreSQL의 COUNT는 일반적으로 bigint이지만 ::int로 변환했으므로
  // likeCount를 JavaScript number로 다룰 수 있습니다.
  // 제네릭 타입은 결과를 검증하지 않으므로 SELECT와 타입이 일치해야 합니다.
  console.dir(posts, { depth: null });
  return posts;
}

/**
 * 작성자별 게시글 조회 결과에 필요한 필드만 정의합니다.
 */
export type AuthorPostRow = {
  id: number;
  title: string;
  published: boolean;
  createdAt: Date;
};

/**
 * 2) $queryRaw 파라미터 바인딩: 특정 작성자의 공개 게시글 조회
 *
 * 함수 인자를 SQL 문자열에 직접 합치지 않고 `${value}`로 전달하면 Prisma가
 * Prepared Statement의 값 파라미터로 처리해 SQL Injection 위험을 낮춥니다.
 */
export async function runQueryRawByAuthor(authorId: number) {
  console.log('--- [2] $queryRaw 작성자별 공개 게시글 조회 ---');

  // DB의 snake_case 컬럼은 큰따옴표 별칭으로 camelCase를 유지해야
  // TypeScript 결과 타입의 createdAt 프로퍼티와 이름이 일치합니다.
  const posts = await prisma.$queryRaw<AuthorPostRow[]>`
    SELECT
      p.id,
      p.title,
      p.published,
      p.created_at AS "createdAt"
    FROM study.posts AS p
    WHERE p.author_id = ${authorId}
      AND p.published = TRUE
    ORDER BY p.created_at DESC, p.id DESC
  `;

  // `${authorId}`는 SQL 문법이 아니라 값으로 바인딩됩니다.
  // 테이블명이나 컬럼명 같은 식별자에는 이 방식을 사용할 수 없습니다.
  console.dir(posts, { depth: null });
  return posts;
}
