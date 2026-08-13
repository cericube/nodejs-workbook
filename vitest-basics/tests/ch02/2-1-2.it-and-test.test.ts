import { describe, it, test, expect } from 'vitest';

const add = (a: number, b: number) => a + b;
const subtract = (a: number, b: number) => a - b;

// it과 test는 동일한 테스트 선언 함수의 별칭(alias)입니다.
// 함수 이름만으로 BDD/TDD 방법론이 결정되는 것은 아니므로 팀의 문체에 맞춰 선택합니다.
describe('계산기', () => {
  // 자연어 문장처럼 읽히는 이름에는 it을 자주 사용합니다.
  it('두 숫자를 더한다', () => {
    expect(add(2, 3)).toBe(5);
  });

  // 기능이나 조건을 직접 서술할 때는 test도 자연스럽습니다.
  test('두 숫자를 뺀다', () => {
    expect(subtract(5, 3)).toBe(2);
  });
});
