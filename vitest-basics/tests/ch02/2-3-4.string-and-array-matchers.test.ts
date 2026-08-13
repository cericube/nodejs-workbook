import { describe, it, expect } from 'vitest';

describe('데이터 컬렉션 및 문자열 검증', () => {
  it('배열(Array) 검증: 목록에 아이템이 포함되어 있는가?', () => {
    const shoppingList = ['Apple', 'Banana', 'Orange'];

    // 1. 원시값 배열에서는 특정 아이템이 포함되어 있는지 확인
    expect(shoppingList).toContain('Banana');

    // 2. 배열의 전체 크기가 예상과 일치하는지 확인
    expect(shoppingList).toHaveLength(3);

    // 3. 객체 배열은 참조가 아닌 프로퍼티 값을 비교하는 toContainEqual을 사용
    const users = [
      { id: 1, name: 'Kim' },
      { id: 2, name: 'Lee' },
    ];
    expect(users).toContainEqual({ id: 1, name: 'Kim' });
  });

  it('문자열(String) 검증: 형식이 올바른가?', () => {
    const welcomeMessage = '안녕하세요, Vitest의 세계에 오신 것을 환영합니다!';
    const email = 'test-user@google.com';

    // 1. 특정 문구가 포함되어 있는지 확인
    expect(welcomeMessage).toContain('Vitest');

    // 2. 정규표현식으로 이메일의 기본 형태를 검사 (실제 주소 존재 여부는 확인하지 않음)
    expect(email).toMatch(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);

    // 3. 특정 단어로 끝나는지 확인
    expect(email).toMatch(/com$/);
  });
});
