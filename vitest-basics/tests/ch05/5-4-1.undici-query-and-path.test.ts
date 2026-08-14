import { describe, it, expect } from 'vitest';
import { request } from 'undici';

// Undici request()는 Axios 인스턴스와 달리 완전한 URL을 전달합니다.
const BASE_URL = 'http://localhost:3001';

describe('GET API 테스트 (undici)', () => {
  it('GET /api/echo?message=hello', async () => {
    // Query String을 URL에 직접 작성하고 응답의 각 부분을 구조 분해합니다.
    const { statusCode, headers, body } = await request(`${BASE_URL}/api/echo?message=hello`);

    expect(statusCode).toBe(200);
    expect(headers['content-type']).toContain('application/json');

    // Undici의 Body는 스트림이므로 json()을 호출해 한 번만 소비합니다.
    const json = await body.json();
    expect(json).toEqual({
      method: 'GET',
      message: 'hello',
    });
  });

  it('GET /api/users/:id', async () => {
    // Path Parameter는 완전한 요청 URL의 일부로 전달합니다.
    const { statusCode, body } = await request(`${BASE_URL}/api/users/10`);
    expect(statusCode).toBe(200);

    // 상태 코드를 확인한 뒤 응답 Body를 JSON으로 변환합니다.
    const json = await body.json();
    expect(json).toEqual({
      method: 'GET',
      userId: 10,
    });
  });
});
