import { describe, it, expect } from 'vitest';
import { testAxios } from './5-3.axios-client';

describe('POST API 테스트 (axios)', () => {
  it('새로운 유저를 생성한다', async () => {
    const newUser = { name: 'kim', age: 30 };

    // Axios는 전달한 객체를 JSON 문자열로 변환하고 응답 JSON도 data로 파싱합니다.
    // 제네릭은 response.data의 구조를 TypeScript에 알려 줍니다.
    const response = await testAxios.post<{
      method: 'POST';
      user: { name: string; age: number };
    }>(`/api/users`, newUser);

    // 리소스 생성 상태와 서버가 돌려준 사용자 정보를 검증합니다.
    expect(response.status).toBe(201);

    expect(response.data.user).toMatchObject(newUser);
  });
});
