import { describe, it, expect } from 'vitest';
import { request } from 'undici';

// Undici는 요청마다 완전한 URL이 필요하므로 기본 주소를 상수로 관리합니다.
const BASE_URL = 'http://localhost:3001';

// body.json()의 unknown 결과에서 사용할 필드를 명시하기 위한 응답 타입입니다.
interface SecureResponse {
  message: string;
  token?: string;
}

describe('Header 기반 API 테스트 (undici)', () => {
  it('Authorization Header가 있으면 200을 반환한다', async () => {
    // 인증이 필요한 요청에 Bearer Token을 Header로 전달합니다.
    const { statusCode, body } = await request(`${BASE_URL}/api/secure`, {
      headers: {
        authorization: 'Bearer test-token',
      },
    });

    expect(statusCode).toBe(200);

    // Body 스트림을 JSON으로 변환한 뒤 인증 성공 메시지를 검증합니다.
    const json = (await body.json()) as SecureResponse;
    expect(json.message).toBe('Authorized');
  });

  it('Authorization Header가 없으면 401을 반환한다', async () => {
    // Undici는 401도 예외로 던지지 않고 일반 응답 객체로 반환합니다.
    const { statusCode, body } = await request(`${BASE_URL}/api/secure`);

    expect(statusCode).toBe(401);

    const json = await body.json();
    expect(json).toEqual({
      message: 'Unauthorized',
    });
  });
});
