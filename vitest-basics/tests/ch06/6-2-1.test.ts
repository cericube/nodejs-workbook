import axios from 'axios';
import { describe, expect, it } from 'vitest';

// 문서 4장의 자체 MSW 서버와 충돌하지 않도록 이 파일에만 setup을 적용합니다.
// 프로젝트 전체에 적용하려면 vitest.config.ts의 setupFiles에 등록할 수 있습니다.
import './6-2-1.setup';

type User = {
  id: number;
  name: string;
  role: string;
};

// 테스트 대상 코드는 MSW를 직접 참조하지 않고 평소처럼 Axios를 사용합니다.
async function fetchUsers(role?: string) {
  const response = await axios.get<User[]>('https://api.example.com/users', {
    // 값이 있을 때만 role Query Parameter를 추가합니다.
    params: role ? { role } : undefined,
  });
  return response.data;
}

describe('사용자 API 통합 테스트', () => {
  it('MSW가 가로챈 기본 사용자 목록을 가져옵니다', async () => {
    const data = await fetchUsers();

    expect(data).toEqual([{ id: 1, name: 'Alice', role: 'user' }]);
  });

  it('Query Parameter를 Mock 응답에 반영합니다', async () => {
    const data = await fetchUsers('admin');

    expect(data[0]).toMatchObject({ name: 'Alice', role: 'admin' });
  });

  it('올바른 사용자 생성 요청에 201로 응답합니다', async () => {
    // id를 함께 보내도 서버가 발급한 id: 2가 최종 응답에 사용되어야 합니다.
    const response = await axios.post('https://api.example.com/users', {
      id: 999,
      name: 'Bob',
      role: 'admin',
    });

    expect(response.status).toBe(201);
    expect(response.data).toEqual({ id: 2, name: 'Bob', role: 'admin' });
  });

  it('name이 없는 사용자 생성 요청에 400으로 응답합니다', async () => {
    const response = await axios.post(
      'https://api.example.com/users',
      { role: 'admin' },
      // Axios가 400 응답을 예외로 바꾸지 않게 하여 상태 코드를 직접 검증합니다.
      { validateStatus: () => true },
    );

    expect(response.status).toBe(400);
  });
});
