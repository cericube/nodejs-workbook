import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface TokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  permissions: string[];
}

type AuthenticatedRequest = FastifyRequest & { user?: TokenPayload };

// 간단한 토큰 검증 (실제로는 JWT 사용)
export function verifyToken(token: string): TokenPayload | null {
  // 테스트용 간단한 토큰 매핑
  const tokens: Record<string, TokenPayload> = {
    'admin-token': {
      userId: '1',
      email: 'admin@example.com',
      role: 'admin',
      permissions: ['read', 'write', 'delete', 'manage-users'],
    },
    'user-token': {
      userId: '2',
      email: 'user@example.com',
      role: 'user',
      permissions: ['read', 'write'],
    },
    'guest-token': {
      userId: '3',
      email: 'guest@example.com',
      role: 'guest',
      permissions: ['read'],
    },
  };

  // 매핑되지 않은 값과 expired-token 모두 null로 처리됩니다.
  return tokens[token] ?? null;
}

// 인증 데코레이터
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Fastify hook의 성공·실패 경로를 모두 Promise 완료로 알립니다.
  await Promise.resolve();
  const authorization = request.headers.authorization;

  if (!authorization) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authorization 헤더가 필요합니다',
      code: 'MISSING_AUTH_HEADER',
    });
    return;
  }

  if (!authorization.startsWith('Bearer ')) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Bearer 토큰 형식이어야 합니다',
      code: 'INVALID_AUTH_FORMAT',
    });
    return;
  }

  const token = authorization.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: '유효하지 않거나 만료된 토큰입니다',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  // request 객체에 사용자 정보 추가
  (request as AuthenticatedRequest).user = payload;
  return undefined;
}

// 권한 체크 데코레이터
export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await Promise.resolve();
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: '인증이 필요합니다',
        code: 'NOT_AUTHENTICATED',
      });
      return;
    }

    const hasPermission = permissions.every((p) => user.permissions.includes(p));

    if (!hasPermission) {
      reply.code(403).send({
        error: 'Forbidden',
        message: '권한이 부족합니다',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: {
          required: permissions,
          actual: user.permissions,
        },
      });
      return;
    }

    return undefined;
  };
}

// 역할 체크 데코레이터
export function requireRole(...roles: Array<'admin' | 'user' | 'guest'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await Promise.resolve();
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: '인증이 필요합니다',
        code: 'NOT_AUTHENTICATED',
      });
      return;
    }

    if (!roles.includes(user.role)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: '접근 권한이 없습니다',
        code: 'INVALID_ROLE',
        details: {
          required: roles,
          actual: user.role,
        },
      });
      return;
    }

    return undefined;
  };
}

////////////////
////////////////
export function secureRoutes(app: FastifyInstance) {
  // 인증만 필요한 엔드포인트
  // Fastify는 Promise 기반 hook을 지원하지만 현재 ESLint 타입 판정은 void callback으로 오인합니다.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/api/profile', { preHandler: authenticate }, (request) => {
    // authenticate가 통과한 경로에서만 handler가 실행됩니다.
    const user = (request as AuthenticatedRequest).user!;

    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
    };
  });

  // 특정 권한이 필요한 엔드포인트
  app.post(
    '/api/documents',
    {
      preHandler: [authenticate, requirePermission('write')],
    },
    (request) => {
      const user = (request as AuthenticatedRequest).user!;

      return {
        message: '문서가 생성되었습니다',
        createdBy: user.userId,
      };
    },
  );

  // 삭제는 더 높은 권한 필요
  app.delete<{ Params: { id: string } }>(
    '/api/documents/:id',
    {
      preHandler: [authenticate, requirePermission('delete')],
    },
    (request) => {
      const { id } = request.params;
      const user = (request as AuthenticatedRequest).user!;

      return {
        message: '문서가 삭제되었습니다',
        documentId: id,
        deletedBy: user.userId,
      };
    },
  );

  // 관리자 전용 엔드포인트
  app.get(
    '/api/admin/users',
    {
      preHandler: [authenticate, requireRole('admin')],
    },
    () => {
      return {
        users: [
          { id: '1', email: 'user1@example.com' },
          { id: '2', email: 'user2@example.com' },
        ],
      };
    },
  );

  // 여러 권한이 필요한 엔드포인트
  app.post(
    '/api/admin/manage-users',
    {
      preHandler: [authenticate, requireRole('admin'), requirePermission('manage-users', 'write')],
    },
    () => {
      return {
        message: '사용자 관리 작업이 완료되었습니다',
      };
    },
  );

  // 읽기 권한만 있어도 접근 가능
  app.get(
    '/api/public-documents',
    {
      preHandler: [authenticate, requirePermission('read')],
    },
    () => {
      return {
        documents: [
          { id: '1', title: 'Public Doc 1' },
          { id: '2', title: 'Public Doc 2' },
        ],
      };
    },
  );

  app.get('/health', () => {
    return {
      ok: true,
    };
  });
}

/////////////////////////////////////////////
import Fastify from 'fastify';

/**
 * 테스트 및 서버 실행용 App Builder
 * - Vitest에서는 이 함수로 app 생성 후 inject() 사용
 * - 실제 서버에서는 listen 전에 동일 함수 사용
 */
export function buildApp() {
  const app = Fastify({
    logger: false, // 테스트 시 불필요한 로그 제거
  });

  app.register(secureRoutes);
  return app;
}
