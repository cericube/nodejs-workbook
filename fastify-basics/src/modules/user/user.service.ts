// src/modules/user/user.service.ts

import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import type { UserRepository } from './user.repository';
import type { UserResult } from './user.types';

// 사용자 조회에 필요한 비즈니스 규칙을 처리하며 HTTP와 Prisma 세부 구현에는 관여하지 않습니다.
export class UserService {
  // 데이터 접근을 직접 수행하지 않고 주입받은 Repository에 위임합니다.
  constructor(private readonly userRepository: UserRepository) {}

  // 사용자 ID로 조회한 결과를 반환하고, 없으면 의미 있는 비즈니스 오류로 변환합니다.
  async getById(id: number): Promise<UserResult> {
    const user = await this.userRepository.findById(id);

    // 존재하지 않는 사용자는 전역 오류 처리기가 404 응답으로 변환합니다.
    if (user === null) {
      throw new BusinessError(ErrorCode.USER_NOT_FOUND, '사용자를 찾을 수 없습니다.', 404);
    }

    // Repository 결과는 Date 등의 애플리케이션 타입을 유지한 채 Controller에 전달합니다.
    return user;
  }
}
