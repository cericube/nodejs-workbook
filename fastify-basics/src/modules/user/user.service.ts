/**
 * 사용자 관련 비즈니스 규칙을 처리하는 애플리케이션 서비스입니다.
 * 회원가입, 조회, 정보 변경, 회원 탈퇴 기능을 제공합니다.
 */

import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import type { PasswordHasher } from '../../common/security/password-hasher';
import type { UserRepository } from './user.repository';
import type { UserResult } from './user.types';
import { UserStatus as UserStatusValue } from './user.types';

export class UserService {
  // DB 접근과 비밀번호 해시 구현을 인터페이스로 주입받아 비즈니스 규칙에 집중합니다.
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  /**
   * 이메일을 정규화하고 중복을 확인한 뒤 비밀번호를 해시하여 사용자를 등록합니다.
   * role과 status는 클라이언트에서 입력받지 않고 Prisma 스키마의 기본값을 사용합니다.
   */
  async register(input: {
    email: string;
    password: string;
    displayName?: string | null;
  }): Promise<UserResult> {
    const email = normalizeEmail(input.email);
    // 해시 생성 전에 중복을 검사해 불필요하게 비용이 큰 scrypt 연산을 피합니다.
    const existingUser = await this.userRepository.findCredentialsByEmail(email);

    if (existingUser !== null) {
      throw new BusinessError(ErrorCode.EMAIL_ALREADY_EXISTS, '이미 사용 중인 이메일입니다.', 409);
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    return this.userRepository.create({
      email,
      passwordHash,
      ...(input.displayName === undefined
        ? {}
        : { displayName: normalizeDisplayName(input.displayName) }),
    });
  }

  /** 사용자 ID로 상세 정보를 조회하며 존재하지 않으면 USER_NOT_FOUND 오류를 발생시킵니다. */
  async getById(id: number): Promise<UserResult> {
    return this.findByIdOrThrow(id);
  }

  /** 현재 비밀번호가 일치할 때만 새 비밀번호를 해시하여 passwordHash를 교체합니다. */
  async updatePassword(
    id: number,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const user = await this.findCredentialsByIdOrThrow(id);
    // 현재 비밀번호가 맞는지 먼저 확인한 뒤에만 새 해시를 생성합니다.
    await this.verifyCurrentPassword(input.currentPassword, user.passwordHash);

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.userRepository.updatePasswordHash(id, passwordHash);
  }

  /**
   * 관리 대상 사용자가 존재하고 탈퇴 상태가 아닐 때 ACTIVE 또는 SUSPENDED로 변경합니다.
   */
  async updateStatus(
    id: number,
    status: typeof UserStatusValue.ACTIVE | typeof UserStatusValue.SUSPENDED,
  ): Promise<UserResult> {
    const user = await this.findByIdOrThrow(id);

    if (user.status === UserStatusValue.WITHDRAWN) {
      throw new BusinessError(
        ErrorCode.USER_ALREADY_WITHDRAWN,
        '이미 탈퇴한 사용자의 상태는 변경할 수 없습니다.',
        409,
      );
    }

    return this.userRepository.updateStatus(id, status);
  }

  /**
   * 사용자의 존재 여부와 탈퇴 여부, 현재 비밀번호를 확인한 뒤 논리적 탈퇴를 처리합니다.
   * 상태 변경과 세션 삭제는 저장소의 트랜잭션에서 함께 처리됩니다.
   */
  async withdraw(id: number, currentPassword: string): Promise<void> {
    const user = await this.findCredentialsByIdOrThrow(id);

    if (user.status === UserStatusValue.WITHDRAWN) {
      throw new BusinessError(ErrorCode.USER_ALREADY_WITHDRAWN, '이미 탈퇴한 사용자입니다.', 409);
    }

    await this.verifyCurrentPassword(currentPassword, user.passwordHash);
    await this.userRepository.withdraw(id, new Date());
  }

  /** 중복되는 사용자 조회 및 404 오류 변환을 한곳에서 처리합니다. */
  private async findByIdOrThrow(id: number): Promise<UserResult> {
    const user = await this.userRepository.findById(id);

    if (user === null) {
      throw new BusinessError(ErrorCode.USER_NOT_FOUND, '사용자를 찾을 수 없습니다.', 404);
    }

    return user;
  }

  /** 비밀번호를 확인해야 하는 기능을 위해 passwordHash가 포함된 사용자 정보를 조회합니다. */
  private async findCredentialsByIdOrThrow(id: number) {
    const user = await this.userRepository.findCredentialsById(id);

    if (user === null) {
      throw new BusinessError(ErrorCode.USER_NOT_FOUND, '사용자를 찾을 수 없습니다.', 404);
    }

    return user;
  }

  /** 입력한 현재 비밀번호와 저장된 해시를 비교하고 불일치하면 인증 오류를 발생시킵니다. */
  private async verifyCurrentPassword(password: string, passwordHash: string): Promise<void> {
    const matches = await this.passwordHasher.verify(password, passwordHash);

    if (!matches) {
      throw new BusinessError(
        ErrorCode.CURRENT_PASSWORD_MISMATCH,
        '현재 비밀번호가 일치하지 않습니다.',
        401,
      );
    }
  }
}

/** 이메일 비교와 고유 제약이 일관되도록 공백 제거 후 소문자로 정규화합니다. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 표시 이름의 앞뒤 공백을 제거하되 값 제거를 뜻하는 null은 그대로 유지합니다. */
function normalizeDisplayName(displayName: string | null): string | null {
  return displayName === null ? null : displayName.trim();
}
