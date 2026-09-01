import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildCh07App } from '../../src/ch07/app';
import type { UserResponse } from '../../src/ch07/user.schema';

// 서버를 포트에 연결하지 않고 Fastify의 app.inject()를 사용하므로 빠르고 독립적으로 실행됩니다.
describe('ch07 Prisma 모델 기반 TypeBox 스키마 패턴', () => {
  // 모든 테스트가 같은 Fastify 인스턴스를 공유하되 테스트 종료 시 반드시 닫습니다.
  let app: FastifyInstance;

  beforeAll(async () => {
    // ch07 전용 실습 앱의 플러그인과 라우트 등록이 끝날 때까지 기다립니다.
    app = buildCh07App();
    await app.ready();
  });

  afterAll(async () => {
    // Fastify가 보유한 리소스를 정리하여 테스트 프로세스가 정상 종료되게 합니다.
    await app.close();
  });

  describe('1.기본 유효성 검증', () => {
    it('1.1 유효한 이메일과 강한 비밀번호를 허용한다', async () => {
      // EmailSchema와 PasswordSchema의 모든 조건을 만족하는 가입 요청입니다.
      const response = await app.inject({
        method: 'POST',
        url: '/users/register',
        payload: {
          email: 'learner@example.com',
          password: 'Fastify12!',
        },
      });

      // 회원가입 라우트에 선언한 200 응답과 공개 사용자 필드를 확인합니다.
      // password 또는 passwordHash는 응답 스키마에 없으므로 노출되지 않습니다.
      expect(response.statusCode).toBe(200);
      const json: UserResponse = response.json();
      console.log('가입 응답 JSON:', json);
      expect(json).toMatchObject({
        id: 2,
        email: 'learner@example.com',
        displayName: null,
        status: 'ACTIVE',
      });
    });

    it('1.2 로그인에서도 재사용한 이메일과 비밀번호 규칙을 적용한다', async () => {
      // 같은 PasswordSchema를 사용하는 로그인 라우트에 올바른 형식의 비밀번호를 보냅니다.
      const validResponse = await app.inject({
        method: 'POST',
        url: '/users/login',
        payload: { email: 'learner@example.com', password: 'Fastify12!' },
      });

      // 최소 길이와 문자 조합 조건을 만족하지 않는 비밀번호는 검증 단계에서 거절됩니다.
      const invalidResponse = await app.inject({
        method: 'POST',
        url: '/users/login',
        payload: { email: 'learner@example.com', password: 'weak' },
      });

      expect(validResponse.statusCode).toBe(200);
      expect(validResponse.json()).toEqual({ authenticated: true });
      expect(invalidResponse.statusCode).toBe(400);
    });

    // 동일한 기대 결과를 갖는 입력 오류를 테이블 기반 테스트로 한 번에 검사합니다.
    it.each([
      ['잘못된 이메일', { email: 'invalid-email', password: 'Fastify12!' }],
      ['약한 비밀번호', { email: 'learner@example.com', password: 'onlyletters' }],
      [
        '정의하지 않은 필드',
        { email: 'learner@example.com', password: 'Fastify12!', role: 'ADMIN' },
      ],
    ])('1.3 %s을 400으로 거절한다', async (_caseName, payload) => {
      // additionalProperties: false이므로 role처럼 정의하지 않은 필드도 허용하지 않습니다.
      const response = await app.inject({
        method: 'POST',
        url: '/users/register',
        payload,
      });

      // 전역 오류 처리기가 모든 검증 오류를 공통 오류 응답으로 변환합니다.
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        success: false,
        code: 'VALIDATION_ERROR',
        message: '입력 형식이 올바르지 않습니다.',
      });
    });

    it('1.4 문자열 경로 ID를 정수로 변환한다', async () => {
      // URL 경로 값은 원래 문자열이지만 Fastify의 Ajv가 Integer 스키마에 맞춰 변환합니다.
      const response = await app.inject({ method: 'GET', url: '/users/7' });

      expect(response.statusCode).toBe(200);
      // response.json()의 기본 반환형은 any이므로 스키마에서 추출한 타입을 지정합니다.
      expect(response.json<UserResponse>().id).toBe(7);
    });

    // IdParamsSchema의 minimum과 정수 조건을 각각 위반하는 경로를 검사합니다.
    it.each(['/users/0', '/users/not-a-number'])(
      '1.5 유효하지 않은 ID %s를 거절한다',
      async (url) => {
        const response = await app.inject({ method: 'GET', url });

        expect(response.statusCode).toBe(400);
      },
    );
  });

  describe('2. Nullable과 스키마 재사용', () => {
    it('2.1 Prisma nullable 필드를 JSON null로 응답한다', async () => {
      // Prisma의 displayName String?에 대응하는 응답이 null을 보존하는지 확인합니다.
      const response = await app.inject({ method: 'GET', url: '/users/1' });

      expect(response.statusCode).toBe(200);
      expect(response.json<UserResponse>().displayName).toBeNull();
    });

    it('2.2 Type.Pick으로 만든 요약 응답만 직렬화한다', async () => {
      // 핸들러 데이터에는 email과 createdAt도 있지만 요약 스키마에는 포함되지 않습니다.
      const response = await app.inject({ method: 'GET', url: '/users' });

      expect(response.statusCode).toBe(200);
      // Fastify 응답 직렬화기가 UserSummarySchema에서 선택한 세 필드만 남깁니다.
      expect(response.json()).toEqual([{ id: 1, displayName: null, status: 'ACTIVE' }]);
    });

    it('2.3 PATCH에서 null은 허용하지만 빈 객체는 거절한다', async () => {
      // null은 값을 지우겠다는 명시적인 수정 요청이므로 허용됩니다.
      const nullableResponse = await app.inject({
        method: 'PATCH',
        url: '/users/1',
        payload: { displayName: null },
      });

      // minProperties: 1이므로 수정할 필드가 없는 빈 객체는 허용되지 않습니다.
      const emptyResponse = await app.inject({
        method: 'PATCH',
        url: '/users/1',
        payload: {},
      });

      expect(nullableResponse.statusCode).toBe(200);
      expect(nullableResponse.json<UserResponse>().displayName).toBeNull();
      expect(emptyResponse.statusCode).toBe(400);
    });

    it('2.4 게시글 content를 null로 수정할 수 있지만 읽기 전용 필드는 수정할 수 없다', async () => {
      // content는 Prisma String? 필드이므로 null로 변경할 수 있습니다.
      const nullableResponse = await app.inject({
        method: 'PATCH',
        url: '/posts/3',
        payload: { content: null },
      });

      // authorId는 UpdatePostBodySchema에 없는 읽기 전용 필드입니다.
      const readonlyFieldResponse = await app.inject({
        method: 'PATCH',
        url: '/posts/3',
        payload: { authorId: 9 },
      });

      expect(nullableResponse.statusCode).toBe(200);
      expect(nullableResponse.json()).toMatchObject({ id: 3, content: null });
      expect(readonlyFieldResponse.statusCode).toBe(400);
    });
  });

  describe('3. 목록 Query 스키마', () => {
    it('3.1 querystring의 정수와 boolean을 변환해 필터링한다', async () => {
      // URL의 authorId와 published는 문자열로 전달되지만 각각 number와 boolean으로 변환됩니다.
      const matchingResponse = await app.inject({
        method: 'GET',
        url: '/posts?authorId=1&published=true&keyword=TypeBox&page=1&limit=10',
      });

      // 예제 게시글은 published: true이므로 false 조건에서는 결과가 없어야 합니다.
      const filteredResponse = await app.inject({
        method: 'GET',
        url: '/posts?published=false',
      });

      expect(matchingResponse.statusCode).toBe(200);
      expect(matchingResponse.json()).toHaveLength(1);
      expect(filteredResponse.statusCode).toBe(200);
      expect(filteredResponse.json()).toEqual([]);
    });

    // 페이지 범위, 최대 조회 개수, 정렬 허용 목록, 정의되지 않은 쿼리의 거절 여부를 검증합니다.
    it.each([
      '/posts?page=0',
      '/posts?limit=101',
      '/posts?sortBy=passwordHash',
      '/posts?unknown=value',
    ])('3.2 허용 범위를 벗어난 Query %s를 거절한다', async (url) => {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('4. PostAttachment와 Route 응답 계약', () => {
    it('4.1 파일 저장 후 만들어진 메타데이터를 검증한다', async () => {
      // 실제 multipart 원본 대신 파일 저장 계층이 생성했다고 가정한 메타데이터입니다.
      // storageKey는 서버가 생성하는 내부 저장 위치이며 DB에는 저장하지만 공개하지 않습니다.
      const response = await app.inject({
        method: 'POST',
        url: '/practice/post-attachments/metadata',
        payload: {
          originalName: 'guide.pdf',
          storageKey: 'posts/1/generated-id.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          postId: 1,
        },
      });

      // 생성 완료 응답에는 DB가 만드는 id와 createdAt이 추가됩니다.
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: 1,
        originalName: 'guide.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        createdAt: '2026-08-24T00:00:00.000Z',
        postId: 1,
      });
    });

    it('4.2 음수 파일 크기와 잘못된 게시글 ID를 거절한다', async () => {
      // size는 0 이상, postId는 1 이상의 정수여야 합니다.
      const response = await app.inject({
        method: 'POST',
        url: '/practice/post-attachments/metadata',
        payload: {
          originalName: 'guide.pdf',
          storageKey: 'posts/1/generated-id.pdf',
          mimeType: 'application/pdf',
          size: -1,
          postId: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('4.3 공개 응답에서 내부 storageKey를 제거한다', async () => {
      // 핸들러는 storageKey도 반환하지만 응답 스키마에는 해당 필드가 없습니다.
      const response = await app.inject({
        method: 'GET',
        url: '/post-attachments/4',
      });

      // JSON 응답에는 클라이언트에 공개할 첨부파일 메타데이터만 남아야 합니다.
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: 4,
        originalName: 'guide.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        createdAt: '2026-08-24T00:00:00.000Z',
        postId: 1,
      });
      // 내부 저장 경로가 실수로 노출되지 않았는지 별도로 강조해 검사합니다.
      expect(response.json()).not.toHaveProperty('storageKey');
    });
  });
});
