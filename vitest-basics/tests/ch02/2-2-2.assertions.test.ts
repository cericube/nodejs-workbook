import { describe, it, expect } from 'vitest';
// describe : 테스트 그룹 정의
// it       : 개별 테스트 케이스 정의
// expect   : 실제 값에 대한 검증(Assertion) 수행

describe('expect 기본 사용법', () => {
  it('값을 검증한다', () => {
    const value = 42;

    // expect(검증할 값)을 전달한다
    expect(value).toBe(42); // 값이 정확히 42인지 비교 (Object.is)

    // 같은 실제 값에 여러 matcher를 각각 적용할 수 있습니다.
    expect(value).toBe(42); // 정확한 값 비교
    expect(value).toBeTypeOf('number'); // 타입 검증
    expect(value).toBeGreaterThan(40); // 크기 비교
  });

  // it.fails는 본문이 실패해야 테스트가 성공한 것으로 처리하는 교육용 예제입니다.
  // 일반 테스트에서 실패를 숨기는 용도로 사용하면 안 됩니다.
  it.fails('Assertion 실패 메시지를 이해한다', () => {
    const actual = 'hello';
    const expected = 'world';

    // 아래 expect는 의도적으로 실패한다
    // 테스트 실패 시 "기대한 값(Expected)"과
    // "실제 값(Received)"이 출력되어 디버깅에 도움을 준다
    //
    // Expected: "world"
    // Received: "hello"
    expect(actual).toBe(expected);
  });

  it.fails('커스텀 에러 메시지를 추가할 수 있다', () => {
    const age = 15;

    // expect의 두 번째 인자로 실패 시 표시할 메시지를 전달할 수 있다
    // 비즈니스 규칙 설명이나 디버깅 힌트를 남길 때 유용하다
    expect(age, '나이는 18세 이상이어야 합니다').toBeGreaterThanOrEqual(18);
  });
});
