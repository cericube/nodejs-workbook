/**
 * 로그인, 토큰 재발급, 로그아웃에 필요한 인증 규칙을 처리합니다.
 * 액세스 JWT는 짧게 사용하고 리프레시 토큰은 서버 세션으로 폐기할 수 있게 관리하여,
 * 요청 인증의 편의성과 로그인 상태를 통제할 수 있는 수단을 함께 제공합니다.
 */

import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import type { PasswordHasher } from '../../common/security/password-hasher';
import type { RefreshTokenManager } from '../../common/security/refresh-token-manager';
import { UserStatus } from '../user/user.types';
import type { AuthRepository } from './auth.repository';
import type { AccessTokenIssuer, AuthTokenResult, AuthUserResult } from './auth.types';

interface AuthServiceOptions {
  // 응답의 expiresIn에 사용할 액세스 토큰 유효 시간입니다. 단위는 초입니다.
  accessTokenExpiresIn: number;
  // 리프레시 세션의 만료 시각을 계산할 유효 시간이며 단위는 초입니다.
  refreshTokenExpiresIn: number;
  // 테스트에서 현재 시각을 고정할 수 있도록 선택적으로 시계 함수를 주입받습니다.
  now?: () => Date;
}

export class AuthService {
  private readonly now: () => Date;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly refreshTokenManager: RefreshTokenManager,
    private readonly accessTokenIssuer: AccessTokenIssuer,
    private readonly options: AuthServiceOptions,
  ) {
    // 별도 시계를 전달하지 않은 운영 코드에서는 실제 현재 시각을 사용합니다.
    this.now = options.now ?? (() => new Date());
  }

  /** 이메일과 비밀번호를 검증하고 액세스 JWT와 리프레시 세션을 발급합니다. */
  async login(emailInput: string, password: string): Promise<AuthTokenResult> {
    // 회원가입과 같은 정규화 규칙을 적용해 대소문자나 앞뒤 공백 차이를 제거합니다.
    const email = emailInput.trim().toLowerCase();
    const user = await this.authRepository.findUserByEmail(email);

    // 사용자 존재 여부와 비밀번호 불일치에 같은 오류를 사용해 계정 존재 여부 노출을 막습니다.
    if (user === null || !(await this.passwordHasher.verify(password, user.passwordHash))) {
      throw new BusinessError(
        ErrorCode.INVALID_CREDENTIALS,
        '이메일 또는 비밀번호가 올바르지 않습니다.',
        401,
      );
    }

    this.assertActiveUser(user);
    return this.createLoginSession(user);
  }

  /**
   * 유효한 리프레시 토큰을 한 번 사용한 뒤 새 리프레시 토큰과 액세스 JWT를 발급합니다.
   * 매번 리프레시 토큰을 교체(rotation)하여 탈취된 이전 토큰의 반복 사용을 차단합니다.
   */
  async refresh(refreshToken: string): Promise<AuthTokenResult> {
    // DB에는 원문 토큰이 없으므로 요청 토큰을 같은 방식으로 해시해 세션을 찾습니다.
    const currentTokenHash = this.refreshTokenManager.hash(refreshToken);
    const session = await this.authRepository.findSessionByTokenHash(currentTokenHash);

    if (session === null) {
      throw new BusinessError(ErrorCode.TOKEN_REVOKED, '폐기된 인증 토큰입니다.', 401);
    }

    if (session.expiresAt.getTime() <= this.now().getTime()) {
      // 만료된 세션은 재사용할 수 없도록 즉시 삭제합니다.
      await this.authRepository.deleteSessionByTokenHash(currentTokenHash);
      throw new BusinessError(ErrorCode.TOKEN_EXPIRED, '인증 토큰이 만료되었습니다.', 401);
    }

    try {
      this.assertActiveUser(session.user);
    } catch (error) {
      // 정지 또는 탈퇴한 사용자의 다른 리프레시 세션도 함께 폐기합니다.
      await this.authRepository.deleteSessionsByUserId(session.userId);
      throw error;
    }

    const nextRefreshToken = this.refreshTokenManager.generate();
    const nextTokenHash = this.refreshTokenManager.hash(nextRefreshToken);
    const refreshTokenExpiresAt = this.getRefreshTokenExpiresAt();
    const rotated = await this.authRepository.rotateSession(
      session.id,
      currentTokenHash,
      nextTokenHash,
      refreshTokenExpiresAt,
    );

    if (!rotated) {
      // 조건부 갱신 결과가 0건이면 다른 요청이 같은 토큰을 이미 사용했다는 뜻입니다.
      // 두 재발급 요청이 동시에 들어와도 하나만 성공하게 해 이전 토큰의 재사용을 막습니다.
      throw new BusinessError(ErrorCode.TOKEN_REVOKED, '이미 사용된 인증 토큰입니다.', 401);
    }

    return this.createTokenResult(session.user, nextRefreshToken, refreshTokenExpiresAt);
  }

  /** 전달된 리프레시 토큰이 있으면 해당 세션을 제거하며, 세션이 없어도 성공으로 처리합니다. */
  async logout(refreshToken: string | undefined): Promise<void> {
    // 쿠키가 이미 없더라도 로그아웃 결과는 같으므로 성공으로 종료합니다.
    if (refreshToken === undefined || refreshToken.length === 0) {
      return;
    }

    await this.authRepository.deleteSessionByTokenHash(this.refreshTokenManager.hash(refreshToken));
  }

  /** 인증된 사용자의 모든 리프레시 세션을 제거합니다. */
  async logoutAll(userId: number): Promise<void> {
    // 이미 발급된 액세스 JWT는 자체 만료 시각까지 유효하지만, 모든 리프레시 세션을 지우면
    // 새 액세스 JWT를 발급할 수 없으므로 각 기기의 로그인 상태가 만료 후 이어지지 않습니다.
    await this.authRepository.deleteSessionsByUserId(userId);
  }

  /** 로그인용 리프레시 토큰을 만들고 해시만 세션에 저장한 뒤 응답 결과를 구성합니다. */
  private async createLoginSession(user: AuthUserResult): Promise<AuthTokenResult> {
    const refreshToken = this.refreshTokenManager.generate();
    const refreshTokenExpiresAt = this.getRefreshTokenExpiresAt();

    await this.authRepository.createSession({
      userId: user.id,
      // 원문은 클라이언트 쿠키로만 보내고 DB 유출에 대비해 해시를 저장합니다.
      tokenHash: this.refreshTokenManager.hash(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    });

    return this.createTokenResult(user, refreshToken, refreshTokenExpiresAt);
  }

  /** 사용자 정보로 액세스 JWT를 발급하고 컨트롤러에 전달할 인증 결과를 만듭니다. */
  private async createTokenResult(
    user: AuthUserResult,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<AuthTokenResult> {
    const accessToken = await this.accessTokenIssuer.issue({
      // JWT 표준 subject 클레임은 문자열이며 인증된 사용자 ID로 사용합니다.
      sub: String(user.id),
      email: user.email,
      role: user.role,
      type: 'access',
    });

    return {
      accessToken,
      accessTokenExpiresIn: this.options.accessTokenExpiresIn,
      refreshToken,
      refreshTokenExpiresAt,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /** 주입된 현재 시각에 초 단위 TTL을 더해 리프레시 세션의 절대 만료 시각을 구합니다. */
  private getRefreshTokenExpiresAt(): Date {
    return new Date(this.now().getTime() + this.options.refreshTokenExpiresIn * 1_000);
  }

  /** 정지 또는 탈퇴 계정은 새 인증 토큰을 발급받지 못하게 합니다. */
  private assertActiveUser(user: AuthUserResult): void {
    if (user.status !== UserStatus.ACTIVE || user.withdrawnAt !== null) {
      throw new BusinessError(ErrorCode.FORBIDDEN, '로그인할 수 없는 사용자 상태입니다.', 403);
    }
  }
}
