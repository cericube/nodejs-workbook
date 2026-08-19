// /src/ch01/validation.ts

import Fastify from 'fastify';

// 요청 처리 과정과 검증 오류를 콘솔에서 확인할 수 있도록 로거를 활성화합니다.
const fastify = Fastify({
  logger: true,
});

// 요청 본문을 표현하는 TypeScript 타입입니다.
// 이 타입은 컴파일 시점에만 검사되며, 실제 요청 데이터 검증은 아래 JSON Schema가 담당합니다.
interface CreateUserBody {
  email: string;
  password: string;
  age?: number;
}

// 제네릭의 Body 타입을 지정하면 핸들러에서 request.body를 안전하게 사용할 수 있습니다.
fastify.post<{ Body: CreateUserBody }>(
  '/users',
  {
    schema: {
      // 클라이언트가 보낸 요청 본문을 실행 시점에 검증합니다.
      body: {
        type: 'object',
        // email과 password는 필수이고 age는 선택 사항입니다.
        required: ['email', 'password'],
        properties: {
          // 올바른 이메일 형식인지 검사합니다.
          email: { type: 'string', format: 'email' },
          // 비밀번호는 8자 이상의 문자열이어야 합니다.
          password: { type: 'string', minLength: 8 },
          age: { type: 'integer' },
        },
      },

      // 상태 코드별 응답 구조를 정의하고 직렬화에 사용합니다.
      // 이 스키마는 HTTP 201 응답에만 적용됩니다.
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            success: { type: 'boolean' },
          },
        },
      },
    },
  },
  async (request, reply) => {
    // 검증을 통과한 요청 본문은 CreateUserBody 타입으로 추론됩니다.
    const { email, password, age } = request.body;

    // 예제에서 사용하지 않는 값임을 명시하여 미사용 변수 경고를 방지합니다.
    void password;
    void age;

    request.log.info({ email }, '사용자 생성 요청을 처리합니다.');

    // 응답 상태 코드와 본문을 설정하여 클라이언트에 전송합니다.
    return reply.code(200).send({ id: '123', success: true });
  },
);

// 서버 시작 중 발생하는 오류를 기록한 뒤 프로세스를 종료합니다.
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

await start();
