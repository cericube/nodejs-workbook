import type { FastifyReply, FastifyRequest } from 'fastify';

/** 예제의 인증 처리와 사용자 상태 확인에 사용하는 내부 사용자 타입입니다. */
export interface User {
  id: number;
  email: string;
  password: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
}

// 데이터베이스 없이 예제를 실행할 수 있도록 메모리에 저장한 학습용 사용자입니다.
// 실제 서비스에서는 평문 비밀번호가 아닌 비밀번호 해시를 저장하고 안전하게 비교해야 합니다.
const users: User[] = [
  {
    id: 100,
    email: 'learner@example.com',
    password: 'Fastify12!',
    role: 'USER',
    status: 'ACTIVE',
  },
];

/**
 * 이메일과 비밀번호가 일치하는 사용자를 찾습니다.
 * 세션 인증 흐름에 집중하기 위한 예제이므로 메모리의 사용자 배열을 조회합니다.
 */
export function authenticateUser(email: string, password: string) {
  return users.find((user) => user.email === email && user.password === password);
}

/** 세션에 저장된 사용자 ID로 현재 사용자 정보를 조회합니다. */
export function findUserById(userId: number) {
  // 사용자가 삭제되었거나 ID가 올바르지 않으면 undefined를 반환합니다.
  return users.find((user) => user.id === userId);
}

/**
 * 인증이 필요한 API가 실행되기 전에 로그인 세션이 있는지 확인합니다.
 * 인증에 실패하면 401 응답을 보내고 이후 라우트 핸들러는 실행하지 않습니다.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    // Fastify 훅에서 reply를 반환하면 응답을 보낸 뒤 현재 요청 처리를 종료합니다.
    return reply.code(401).send({
      code: 'UNAUTHORIZED',
      message: '로그인이 필요합니다.',
    });
  }

  return;
}

/**
 * 비밀번호와 계정 상태 같은 내부 필드를 제외하고 공개 가능한 사용자 정보만 반환합니다.
 * API 응답 구조를 내부 사용자 타입과 분리해 민감한 정보가 실수로 노출되는 것을 방지합니다.
 */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}
