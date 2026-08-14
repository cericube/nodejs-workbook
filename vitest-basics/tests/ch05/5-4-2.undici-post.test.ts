import { describe, it, expect } from 'vitest';
import { request } from 'undici';

// 각 Undici 요청에서 사용할 실습 서버의 기본 주소입니다.
const BASE_URL = 'http://localhost:3001';

describe('POST API 테스트 (undici)', () => {
  it('POST /api/users', async () => {
    // Undici에서는 HTTP Method, Content-Type과 문자열 Body를 명시적으로 전달합니다.
    const { statusCode, body } = await request(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      // Axios와 달리 요청 객체를 직접 JSON 문자열로 변환합니다.
      body: JSON.stringify({
        name: 'kim',
        age: 30,
      }),
    });

    expect(statusCode).toBe(201);

    // 응답 스트림을 소비하고 생성된 사용자 정보를 검증합니다.
    const json = await body.json();
    expect(json).toEqual({
      method: 'POST',
      user: {
        name: 'kim',
        age: 30,
      },
    });
  });
});
