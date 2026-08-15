import { describe, it, expect } from 'vitest';
import { validateUserAge } from '../../src/ch07/user.service';

describe('validateUserAge', () => {
  it('성인인 경우 true를 반환해야 한다', () => {
    const user = { id: 1, name: 'Alice', age: 20 };
    expect(validateUserAge(user)).toBe(true);
  });

  // 누락된 케이스: 미성년자(false 반환), 음수 나이(에러 발생)

  // it('미성년자인 경우 false를 반환해야 한다', () => {
  //   const user = { id: 2, name: 'Bob', age: 15 };
  //   expect(validateUserAge(user)).toBe(false);
  // });

  // it('나이가 음수면 에러를 던져야 한다', () => {
  //   const user = { id: 3, name: 'Charlie', age: -1 };
  //   expect(() => validateUserAge(user)).toThrow('Age cannot be negative');
  // });
});
