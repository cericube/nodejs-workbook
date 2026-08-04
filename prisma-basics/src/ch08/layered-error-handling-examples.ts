import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { prisma } from '../shared/database';
import { ConflictError } from './application-errors';
import { toHttpErrorResult } from './prisma-error-mapping-examples';

/**
 * Repository: Prisma Client를 사용한 데이터 접근만 담당합니다.
 *
 * HTTP 상태를 결정하거나 모든 오류를 반복해서 잡지 않고, 처리하지 않은 Prisma
 * 오류는 Service 또는 전역 오류 처리 계층으로 전달합니다.
 */
export class UserRepository {
  constructor(private readonly client: PrismaClient) {}

  findByEmail(email: string) {
    // email은 @unique 필드이므로 findUnique로 최대 한 명을 조회합니다.
    return this.client.user.findUnique({ where: { email } });
  }

  create(data: Prisma.UserCreateInput) {
    // Repository는 검증된 생성 데이터를 Prisma Client에 전달하는 데 집중합니다.
    return this.client.user.create({ data });
  }
}

/**
 * Service: 가입 정책을 검사하고 예상 가능한 비즈니스 오류를 표현합니다.
 */
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async register(email: string, displayName: string) {
    const existingUser = await this.repository.findByEmail(email);

    if (existingUser) {
      throw new ConflictError('이미 가입된 이메일입니다.', 'DUPLICATE_RESOURCE');
    }

    // 사전 조회 직후 다른 요청이 같은 email을 생성할 수 있으므로 DB의 unique
    // 제약은 여전히 필요합니다. 경쟁으로 발생한 P2002는 전역 매퍼가 처리합니다.
    return this.repository.create({ email, displayName });
  }
}

export type RegisterUserInput = {
  email: string;
  displayName: string;
};

const userRepository = new UserRepository(prisma);
const userService = new UserService(userRepository);

/**
 * Controller 역할 예제: 입력을 Service에 전달하고 성공 응답 데이터만 만듭니다.
 *
 * 여기에서는 같은 try-catch를 반복하지 않습니다. 거부된 Promise는 웹 프레임워크의
 * 전역 오류 핸들러가 받아 toHttpErrorResult 같은 공통 변환 함수를 사용할 수 있습니다.
 */
export async function runRegisterUserController(
  input: RegisterUserInput,
  service: UserService = userService,
) {
  const user = await service.register(input.email, input.displayName);

  return {
    statusCode: 201,
    body: {
      id: user.id,
      email: user.email,
    },
  };
}

/**
 * 전역 오류 핸들러 역할 예제입니다.
 * 원본 오류 로깅은 프레임워크에서 수행하고 외부에는 표준화된 결과만 반환합니다.
 */
export function runGlobalErrorHandler(error: unknown) {
  return toHttpErrorResult(error);
}
