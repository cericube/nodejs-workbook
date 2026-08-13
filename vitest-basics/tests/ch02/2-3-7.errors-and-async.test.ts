import { describe, it, expect } from 'vitest';

////////////////////////////////
// 에러 발생 검증
////////////////////////////////
const withdrawMoney = (amount: number) => {
  if (amount < 0) throw new Error('음수 금액은 출금할 수 없습니다.');
};

describe('예외처리', () => {
  it('출금 에러 검증', () => {
    // 1. 에러가 발생하는지만 확인
    expect(() => withdrawMoney(-100)).toThrow();

    // 2. 특정 에러 메시지가 포함되어 있는지 확인 (가장 많이 쓰임)
    expect(() => withdrawMoney(-100)).toThrow('음수 금액');

    // 3. 특정 에러 클래스의 인스턴스인지 확인
    expect(() => withdrawMoney(-100)).toThrow(Error);
  });
});

////////////////////////////////
//  비동기 검증
////////////////////////////////
const fetchUser = (id: number): Promise<{ id: number; name: string }> => {
  // 명시적으로 resolve/reject된 Promise를 반환해 비동기 API의 두 경로를 재현합니다.
  if (id <= 0) return Promise.reject(new Error('Invalid ID'));
  return Promise.resolve({ id, name: 'User' + id });
};

describe('비동기 검증(resolves, rejects)', () => {
  it('비동기 성공 및 실패 검증', async () => {
    // 성공(resolve) 검증
    await expect(fetchUser(1)).resolves.toEqual({ id: 1, name: 'User1' });
    // 실패(Reject) 검증
    await expect(fetchUser(0)).rejects.toThrow('Invalid ID');
  });

  it('await를 직접 활용한 검증', async () => {
    const result = await fetchUser(10);

    expect(result.id).toBe(10);
    expect(result.name).toContain('User');
  });

  it('try-catch를 이용한 정밀한 에러 검증', async () => {
    // 예외가 발생하지 않아 catch가 실행되지 않는 경우의 거짓 양성을 방지합니다.
    expect.assertions(2);

    try {
      await fetchUser(-1);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);

      if (error instanceof Error) {
        expect(error.message).toBe('Invalid ID');
      }
    }
  });
});
