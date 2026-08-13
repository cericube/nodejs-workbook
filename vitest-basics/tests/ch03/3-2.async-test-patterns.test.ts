import { describe, it, expect } from 'vitest';

interface User {
  id: number;
  name: string;
  role: 'admin' | 'user';
}

async function getUserById(id: number): Promise<User> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (id <= 0) {
        reject(new Error('Invalid ID'));
        return;
      }

      resolve({ id, name: 'Alice', role: 'admin' });
    }, 100);
  });
}

describe('getUserById 테스트', () => {
  // 1. async/await 패턴
  it('[ASYNC] 존재하는 사용자의 정보를 반환한다', async () => {
    const user = await getUserById(1);
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('admin');
  });
  //
  // 2. resolves/rejects를 사용하면 Promise의 성공·실패 결과를 직접 검증할 수 있습니다.
  it('[RESOLVES] 성공 시 사용자 이름을 포함한다', async () => {
    await expect(getUserById(1)).resolves.toMatchObject({ name: 'Alice' });
  });

  it('[REJECTS] 잘못된 ID 입력 시 에러를 던진다', async () => {
    await expect(getUserById(0)).rejects.toThrow('Invalid ID');
  });
  //
  // 3. 세 번째 인자는 이 테스트 하나에만 적용되는 제한 시간(ms)입니다.
  it('[TIMEOUT] 3초 이내에 외부 API 응답을 받아야 한다.', async () => {
    const user = await getUserById(1);
    expect(user.name).toBe('Alice');
  }, 3000);

  //
  // 4. Promise를 반환하면 Vitest가 resolve될 때까지 기다립니다.
  // return을 빠뜨리면 assertion 실행 전에 테스트가 끝나는 거짓 양성이 생길 수 있습니다.
  it('[PROMISE] Promise를 return하여 비동기를 제어한다.', () => {
    return getUserById(1).then((user) => {
      expect(user.id).toBe(1);
    });
  });
});
