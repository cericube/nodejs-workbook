// tests/ch06/6-4.msw.server.test

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './6-4.fastify.server';

/* ------------------------------------------------------------------
   1. MSW 핸들러(외부 API 계약) 정의
   ------------------------------------------------------------------ */

// Path Parameter 타입을 명시해야 params.id 접근 시 TypeScript 에러가 나지 않는다.
type UserParams = {
  id: string;
};

// response.json()의 기본 반환형 any를 피하기 위한 내부 API 응답 DTO입니다.
type UserProfileResponse = {
  userId: string;
  displayName: string;
  email: string;
};

type SecureDataResponse = {
  secretData: string;
};

type ErrorResponse = {
  error: string;
};

// setupServer(): 실제 서버를 열지 않고 Node.js의 네트워크 요청을 가로챕니다.
const externalServer = setupServer(
  // 외부 사용자 조회 API 시뮬레이션
  http.get<UserParams>('https://api.external.com/users/:id', ({ params }) => {
    // URL 경로의 :id 값 추출
    const { id } = params;

    // 실제 외부 API와 동일한 형태의 JSON 응답 반환
    return HttpResponse.json(
      {
        id,
        name: 'External User 123',
        email: 'test@test.com',
      },
      { status: 200 },
    );
  }),
);

/* ------------------------------------------------------------------
   2. 테스트 환경 라이프사이클 관리
   ------------------------------------------------------------------ */

// Fastify 앱 인스턴스를 describe 블록 전체에서 재사용
// typeof createApp → 함수 타입 추출
// ReturnType<...> → 그 함수의 반환 타입만 추출
let app: ReturnType<typeof createApp>;

// 모든 테스트 실행 전 1회 호출
beforeAll(async () => {
  // MSW를 시작하면 등록된 Handler와 일치하는 외부 요청을 가로챕니다.
  externalServer.listen({
    // 핸들러에 없는 요청이 발생하면 테스트 실패 처리
    onUnhandledRequest: 'error',
  });

  // Fastify 앱 생성 (실제 listen은 하지 않음)
  app = createApp();

  // 플러그인, 라우트, 훅 등록이 모두 끝날 때까지 대기
  await app.ready();
});

// 각 테스트 종료 후 호출 → 핸들러 override 상태 초기화
afterEach(() => {
  externalServer.resetHandlers();
});

// 모든 테스트 종료 후 1회 호출
afterAll(async () => {
  // MSW 서버 종료
  externalServer.close();

  // Fastify 리소스 정리
  await app.close();
});

/* ------------------------------------------------------------------
   3. Fastify API 통합 테스트
   ------------------------------------------------------------------ */

describe('Fastify + MSW 외부 API 통합 테스트', () => {
  // 외부 사용자 API 호출 후 가공된 응답 반환 시나리오
  it('외부 사용자 API를 호출하여 가공된 응답을 반환한다', async () => {
    // inject()는 실제 포트를 열지 않고 Fastify 내부로 HTTP 요청을 주입합니다.
    const response = await app.inject({
      method: 'GET',
      url: '/user-profile/user_123',
    });

    // HTTP 상태 코드 검증
    expect(response.statusCode).toBe(200);

    // 제네릭을 지정해 파싱 결과가 any가 되지 않도록 합니다.
    const json = response.json<UserProfileResponse>();

    // 내부 비즈니스 로직 결과 검증
    expect(json).toEqual({
      userId: 'user_123',
      displayName: 'EXTERNAL USER 123', // name을 대문자로 변환한 결과
      email: 'test@test.com',
    });
  });

  // Authorization 헤더에 따라 외부 API 접근이 제어되는지 검증
  it('Authorization 헤더에 따라 외부 API 접근이 제어된다', async () => {
    // 이 테스트에서만 사용할 핸들러입니다. afterEach에서 자동 제거됩니다.
    externalServer.use(
      http.get('https://api.external.com/data', ({ request }) => {
        const authHeader = request.headers.get('authorization');

        if (authHeader !== 'Bearer valid_token_123') {
          return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return HttpResponse.json({
          secretData: 'This is very secure data.',
        });
      }),
    );

    // Fastify → Axios → MSW까지 정상 토큰이 그대로 전달되는지 확인합니다.
    const validResponse = await app.inject({
      method: 'GET',
      url: '/secure-data',
      headers: {
        // Fastify는 내부적으로 헤더를 소문자로 정규화
        authorization: 'Bearer valid_token_123',
      },
    });

    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.json<SecureDataResponse>()).toEqual({
      secretData: 'This is very secure data.',
    });

    // 잘못된 토큰에는 외부 API가 반환한 403 상태와 Body가 전달되어야 합니다.
    const invalidResponse = await app.inject({
      method: 'GET',
      url: '/secure-data',
      headers: {
        authorization: 'Bearer invalid_token_456',
      },
    });

    expect(invalidResponse.statusCode).toBe(403);
    expect(invalidResponse.json<ErrorResponse>()).toEqual({ error: 'Forbidden' });
  });
});
