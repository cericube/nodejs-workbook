import { describe, it, expect } from 'vitest';
import { testAxios } from './5-3.axios-client';

describe('GET API 테스트 (axios)', () => {
  it('Query Parameter 전달 및 응답 검증', async () => {
    // params 객체는 Axios가 ?message=hello 형태의 Query String으로 변환합니다.
    const response = await testAxios.get(`/api/echo`, {
      params: {
        message: 'hello',
      },
    });

    // Axios 응답 객체에서 상태 코드, 자동 파싱된 JSON과 Header를 각각 검증합니다.
    expect(response.status).toBe(200);

    expect(response.data).toEqual({
      method: 'GET',
      message: 'hello',
    });

    expect(response.headers['content-type']).toContain('application/json');
  });

  it('Path Parameter를 통한 데이터 조회', async () => {
    // Path Parameter는 URL 경로에 직접 포함하여 전달합니다.
    const response = await testAxios.get(`/api/users/10`);

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      method: 'GET',
      userId: 10,
    });
  });
});
