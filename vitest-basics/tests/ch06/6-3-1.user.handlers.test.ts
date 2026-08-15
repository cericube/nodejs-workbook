import axios from 'axios';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

type UserParams = {
  id: string;
};

type CreateUserBody = {
  name: string;
};

// 이 파일에서 검증할 두 외부 API의 기본 응답 계약을 등록합니다.
const server = setupServer(
  // 첫 번째 타입 인자는 URL의 :id Path Parameter 형태를 지정합니다.
  http.get<UserParams>('https://api.external.com/users/:id', ({ params }) => {
    return HttpResponse.json({
      id: Number(params.id),
      name: 'Test User',
      email: 'test@example.com',
    });
  }),

  // Path Parameter가 없으므로 never, 요청 JSON Body에는 CreateUserBody를 지정합니다.
  http.post<never, CreateUserBody>('https://api.external.com/users', async ({ request }) => {
    // 제네릭으로 지정한 덕분에 body는 CreateUserBody로 추론됩니다.
    const body = await request.json();

    return HttpResponse.json(
      { ...body, id: 100 },
      {
        status: 201,
        // 실제 API처럼 응답 상태뿐 아니라 사용자 정의 Header도 만들 수 있습니다.
        headers: { 'X-Request-Id': 'mock-123' },
      },
    );
  }),
);

// 테스트 파일 시작 시 가로채기를 켜고, 각 테스트 후 임시 핸들러를 초기화합니다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
// 인터셉터가 다른 테스트 파일에 영향을 주지 않도록 반드시 종료합니다.
afterAll(() => server.close());

describe('외부 사용자 API 핸들러', () => {
  it('Path Parameter를 사용자 응답에 반영합니다', async () => {
    // 실제 Axios 요청이지만 MSW가 네트워크 계층에서 응답을 대신 반환합니다.
    const response = await axios.get('https://api.external.com/users/7');

    expect(response.data).toEqual({
      id: 7,
      name: 'Test User',
      email: 'test@example.com',
    });
  });

  it('POST Body를 읽어 응답과 Header를 생성합니다', async () => {
    const response = await axios.post('https://api.external.com/users', {
      name: 'Alice',
    });

    expect(response.status).toBe(201);
    expect(response.data).toEqual({ id: 100, name: 'Alice' });
    // Axios는 응답 Header 이름을 소문자로 정규화합니다.
    expect(response.headers['x-request-id']).toBe('mock-123');
  });
});
