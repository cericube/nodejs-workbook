import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../shared/database';
import { BadRequestError, ConflictError, NotFoundError } from './application-errors';

/**
 * 1) P2002: 중복 email을 애플리케이션 충돌 오류로 변환
 *
 * User.email은 @unique 필드입니다. 동시에 같은 이메일로 가입하는 경쟁 상황도
 * 있으므로 사전 중복 조회만 믿지 않고 create의 P2002를 처리해야 합니다.
 */
export async function runCreateUserWithErrorHandling(email: string, displayName: string) {
  console.log('--- [1] P2002 중복 User 오류 처리 ---');

  try {
    return await prisma.user.create({
      data: { email, displayName },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 가입된 이메일입니다.', 'DUPLICATE_RESOURCE');
    }

    // 이 함수가 예상한 P2002가 아닌 오류는 원본 정보와 스택을 유지합니다.
    throw error;
  }
}

/**
 * 2) P2003: 존재하지 않는 authorId 참조 오류 변환
 *
 * Post.authorId는 User.id를 참조하는 필수 외래 키입니다. 존재하지 않는 id를
 * 저장하려 하면 DB가 관계 정합성을 지키기 위해 요청을 거부합니다.
 */
export async function runCreatePostWithErrorHandling(authorId: number, title: string) {
  console.log('--- [2] P2003 외래 키 오류 처리 ---');

  try {
    return await prisma.post.create({
      data: { authorId, title },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BadRequestError('존재하지 않는 작성자입니다.', 'INVALID_REFERENCE');
    }

    throw error;
  }
}

/**
 * 3) P2025: 반드시 필요한 User가 없을 때 404 의미로 변환
 *
 * findUnique와 달리 findUniqueOrThrow는 결과가 없으면 null이 아니라 P2025를
 * 발생시킵니다. 이후 코드에서 null 분기 없이 존재하는 User를 사용할 수 있습니다.
 */
export async function runFindUserWithErrorHandling(userId: number) {
  console.log('--- [3] P2025 User 미존재 오류 처리 ---');

  try {
    return await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('사용자를 찾을 수 없습니다.');
    }

    throw error;
  }
}
