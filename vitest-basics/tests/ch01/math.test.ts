// tests/ch01/math.test.ts
import { describe, expect, it } from 'vitest';
import { add } from '../../src/ch01/math';

// add 함수의 동작을 하나의 테스트 그룹으로 묶습니다.
describe('Math Service', () => {
  it('1 더하기 2는 3이어야 한다', () => {
    const result = add(1, 2);

    // 실제 반환값이 기대한 값과 같은지 확인합니다.
    expect(result).toBe(3);
  });
});
