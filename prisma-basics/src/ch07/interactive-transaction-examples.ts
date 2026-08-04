import { prisma } from '../shared/database';

const ALLOWED_EMAIL_DOMAIN = '@example.com';

/**
 * 가입에 허용된 이메일 도메인인지 확인합니다.
 */
function isAllowedEmailDomain(email: string): boolean {
  return email.endsWith(ALLOWED_EMAIL_DOMAIN);
}

/**
 * 1) 대화형 트랜잭션: User 생성 결과로 Post 생성
 *
 * 앞에서 생성한 user.id를 다음 작업에서 사용하고 중간에 가입 정책도 검사하므로
 * 콜백 형태의 대화형 트랜잭션이 적합합니다. 콜백이 정상 종료되면 커밋됩니다.
 */
export async function runInteractiveCreateUserWithPost(email: string, postTitle: string) {
  console.log('--- [1] 대화형 트랜잭션 User + Post 생성 ---');

  // 콜백이 반환한 Promise가 정상 완료되면 자동 커밋되고,
  // 콜백 밖으로 오류가 전달되면 콜백 안에서 실행한 모든 tx 작업이 롤백됩니다.
  const result = await prisma.$transaction(async (tx) => {
    // 트랜잭션 범위의 작업에는 전역 prisma가 아니라 콜백으로 받은 tx를 사용합니다.
    // select는 반환 필드만 제한하며 실제로 저장되는 컬럼에는 영향을 주지 않습니다.
    const user = await tx.user.create({
      data: {
        email,
        displayName: email.split('@')[0] || null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });

    // DB 오류가 아닌 애플리케이션 규칙도 오류를 던져 전체 작업을 롤백할 수 있습니다.
    // 여기서 실패하면 앞에서 실행한 user.create도 데이터베이스에 남지 않습니다.
    if (!isAllowedEmailDomain(user.email)) {
      throw new Error('example.com 도메인 이메일만 가입할 수 있습니다.');
    }

    // 같은 트랜잭션에서 생성한 user.id를 Post의 외래 키로 바로 사용합니다.
    const post = await tx.post.create({
      data: {
        title: postTitle,
        authorId: user.id,
      },
    });

    return { user, post };
  });

  console.dir(result, { depth: null });
  return result;
}

/**
 * 2) 대화형 트랜잭션 조건 분기: 비공개 Post 안전하게 공개
 *
 * 현재 상태를 읽은 뒤 비즈니스 규칙을 통과한 경우에만 update합니다.
 * Post가 없거나 이미 공개 상태이면 오류를 던져 변경 없이 종료합니다.
 */
export async function runPublishPostSafely(postId: number) {
  console.log('--- [2] 대화형 트랜잭션 Post 공개 ---');

  const post = await prisma.$transaction(async (tx) => {
    // 조회 결과를 같은 콜백의 조건 분기에 사용하려면 배열 기반 방식이 아니라
    // 대화형 트랜잭션을 사용해야 합니다.
    const currentPost = await tx.post.findUnique({
      where: { id: postId },
    });

    if (!currentPost) {
      throw new Error('POST_NOT_FOUND');
    }

    if (currentPost.published) {
      throw new Error('ALREADY_PUBLISHED_POST');
    }

    // 조회와 변경을 같은 tx로 실행해 하나의 트랜잭션 범위에 포함합니다.
    // 높은 동시성에서 상태 경쟁까지 방지해야 한다면 격리 수준이나 조건부 갱신도
    // 서비스 요구 사항에 맞춰 함께 검토해야 합니다.
    return tx.post.update({
      where: { id: currentPost.id },
      data: {
        title: `[공개] ${currentPost.title}`,
        published: true,
      },
    });
  });

  console.log(post);
  return post;
}
