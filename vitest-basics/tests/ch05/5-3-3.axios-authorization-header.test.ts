import { describe, it, expect } from 'vitest';
import { testAxios } from './5-3.axios-client';

describe('Header 기반 API 테스트 (axios)', () => {
  it('Authorization Header가 있으면 200을 반환한다', async () => {
    // 이 요청에만 필요한 Authorization Header를 공통 설정에 추가합니다.
    const response = await testAxios.get<{ message: string; token: string }>(`/api/secure`, {
      headers: {
        Authorization: 'Bearer test-token',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data.message).toBe('Authorized');
  });

  it('Authorization Header가 없으면 401을 반환한다', async () => {
    // Axios는 기본적으로 2xx가 아닌 응답을 Promise rejection으로 처리합니다.
    // rejects를 사용하면 요청이 뜻밖에 성공했을 때도 테스트가 확실히 실패합니다.
    await expect(testAxios.get(`/api/secure`)).rejects.toMatchObject({
      response: {
        status: 401,
        data: { message: 'Unauthorized' },
      },
    });
  });
});
