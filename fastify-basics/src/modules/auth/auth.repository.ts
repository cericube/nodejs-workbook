/**
 * 인증용 사용자 조회와 리프레시 세션 저장·교체를 담당하는 Prisma 저장소입니다.
 * 액세스 JWT는 DB에 저장하지 않고 서명과 만료 시각으로 검증하며, 서버에서 폐기할 필요가 있는
 * 리프레시 토큰만 Session 테이블에서 관리합니다.
 */

import type { PrismaClient } from '../../generated/prisma/client';
import type { CreateSessionData } from './auth.types';

const authUserSelect = {
  id: true,
  email: true,
  passwordHash: true,
  status: true,
  role: true,
  withdrawnAt: true,
} as const;

export class AuthRepository {
  // 애플리케이션이 공유하는 Prisma Client를 주입받아 요청마다 연결을 새로 만들지 않습니다.
  constructor(private readonly prisma: PrismaClient) {}

  /** 정규화된 이메일로 로그인 검증에 필요한 사용자 정보를 조회합니다. */
  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      // email은 User 모델의 고유 필드이므로 findUnique로 최대 한 명만 조회합니다.
      where: { email },
      // 로그인에 필요한 필드만 선택하고 다른 사용자 정보는 조회하지 않습니다.
      select: authUserSelect,
    });
  }

  /** 리프레시 토큰 원문 대신 해시와 만료 시각을 세션으로 저장합니다. */
  async createSession(data: CreateSessionData): Promise<void> {
    await this.prisma.session.create({
      data,
      // 생성 성공 여부만 필요하므로 전체 세션 대신 id만 반환받습니다.
      select: { id: true },
    });
  }

  /** 리프레시 토큰 해시로 세션과 현재 사용자 상태를 함께 조회합니다. */
  findSessionByTokenHash(tokenHash: string) {
    return this.prisma.session.findUnique({
      // tokenHash는 Session 모델의 고유 필드이며 리프레시 토큰 원문은 DB에 저장하지 않습니다.
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        user: { select: authUserSelect },
      },
    });
  }

  /**
   * 현재 해시가 일치하는 세션만 새 해시로 교체합니다.
   * 같은 리프레시 토큰을 동시에 사용해도 한 요청만 성공하도록 updateMany의 변경 건수를 확인합니다.
   * findUnique 후 update를 따로 수행하는 것만으로는 두 요청이 모두 성공할 수 있어 조건부 갱신이 필요합니다.
   */
  async rotateSession(
    sessionId: string,
    currentTokenHash: string,
    newTokenHash: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      // id와 기존 해시가 모두 일치할 때만 갱신해 이미 회전된 토큰의 재사용을 막습니다.
      where: { id: sessionId, tokenHash: currentTokenHash },
      data: { tokenHash: newTokenHash, expiresAt },
    });

    return result.count === 1;
  }

  /** 로그아웃한 리프레시 토큰에 해당하는 세션이 있으면 삭제합니다. */
  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    // deleteMany는 대상이 없어도 오류가 나지 않아 로그아웃을 멱등하게 처리할 수 있습니다.
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  /** 비밀번호 변경, 계정 정지, 전체 로그아웃 시 사용자의 모든 세션을 삭제합니다. */
  async deleteSessionsByUserId(userId: number): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
