/**
 * 사용자 데이터를 영속화하는 저장소입니다.
 * Prisma 쿼리를 캡슐화하고 서비스에 사용자 조회·생성·변경 기능을 제공합니다.
 */

import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { CreateUserData } from './user.types';

// 비밀번호 해시를 제외하고 HTTP 계층까지 전달해도 되는 사용자 필드입니다.
const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  role: true,
  withdrawnAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const credentialsUserSelect = {
  // 현재 비밀번호 검증이 필요한 내부 조회에서만 passwordHash를 추가합니다.
  ...publicUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

export class UserRepository {
  // Fastify Prisma 플러그인이 생성한 공용 클라이언트를 주입받습니다.
  constructor(private readonly prisma: PrismaClient) {}

  /** 해시된 비밀번호와 사용자 입력값을 저장하고 공개 가능한 필드만 반환합니다. */
  create(data: CreateUserData) {
    return this.prisma.user.create({
      // status와 role을 전달하지 않아 Prisma 스키마의 안전한 기본값을 사용합니다.
      data,
      select: publicUserSelect,
    });
  }

  /** 기본 키로 사용자 한 명을 조회하며 존재하지 않으면 null을 반환합니다. */
  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  /** 비밀번호 변경이나 회원 탈퇴에 필요한 비밀번호 해시와 사용자 정보를 조회합니다. */
  findCredentialsById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: credentialsUserSelect,
    });
  }

  /** 로그인 이메일로 사용자와 passwordHash를 함께 조회하며 존재하지 않으면 null을 반환합니다. */
  findCredentialsByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: credentialsUserSelect,
    });
  }

  /** 새 passwordHash를 저장하고 탈취됐을 수 있는 기존 로그인 세션을 모두 폐기합니다. */
  async updatePasswordHash(id: number, passwordHash: string) {
    // 비밀번호 변경과 기존 로그인 세션 삭제를 하나의 원자적 작업으로 묶습니다.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id },
        data: { passwordHash },
        select: { id: true },
      });
      await transaction.session.deleteMany({ where: { userId: id } });
    });
  }

  /** 상태를 변경하고 SUSPENDED로 전환하면 기존 로그인 세션을 모두 폐기합니다. */
  async updateStatus(id: number, status: 'ACTIVE' | 'SUSPENDED') {
    // 상태 변경과 정지된 사용자의 세션 삭제가 함께 성공하거나 함께 취소됩니다.
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: { status },
        select: publicUserSelect,
      });

      if (status === 'SUSPENDED') {
        await transaction.session.deleteMany({ where: { userId: id } });
      }

      return user;
    });
  }

  /**
   * 사용자를 WITHDRAWN 상태로 전환하고 탈퇴 시각을 기록합니다.
   * 같은 트랜잭션에서 모든 세션을 삭제해 기존 로그인 상태도 함께 해제합니다.
   */
  async withdraw(id: number, withdrawnAt: Date) {
    // 탈퇴 상태 변경과 모든 로그인 세션 제거는 하나의 트랜잭션으로 처리합니다.
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt,
        },
        select: publicUserSelect,
      });

      await transaction.session.deleteMany({ where: { userId: id } });

      return user;
    });
  }
}
