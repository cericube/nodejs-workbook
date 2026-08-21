import type { PrismaClient } from '../../generated/prisma/client';

// Prisma를 이용한 사용자 데이터 조회를 캡슐화하여 상위 계층이 DB 구현을 직접 다루지 않게 합니다.
export class UserRepository {
  // Fastify 플러그인에서 공유하는 Prisma Client를 외부에서 주입받습니다.
  constructor(private readonly prisma: PrismaClient) {}

  // 기본 키로 사용자를 조회하며, 사용자가 없으면 Prisma가 null을 반환합니다.
  findById(id: number) {
    return this.prisma.user.findUnique({
      // id는 고유 키이므로 findUnique로 한 명만 조회합니다.
      where: { id },
      // 비밀번호 해시처럼 응답에 필요하지 않은 값은 조회하지 않습니다.
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
