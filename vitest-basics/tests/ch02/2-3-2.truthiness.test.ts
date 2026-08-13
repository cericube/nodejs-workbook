import { describe, test, expect } from 'vitest';

describe('1. Truthiness 실습', () => {
  test('null 값의 상태 검증', () => {
    const value = null;

    expect(value).toBeNull(); // ✅ null인지 확인
    expect(value).toBeDefined(); // ✅ 정의는 되어 있음 (undefined가 아님)
    expect(value).not.toBeUndefined(); // ✅ undefined가 아님
    expect(value).not.toBeTruthy(); // ✅ 부정 matcher: null은 Truthy가 아님
    expect(value).toBeFalsy(); // ✅ null은 거짓 같은 값(Falsy)임
  });

  test('undefined 값의 상태 검증', () => {
    const value = undefined;

    expect(value).toBeUndefined(); // ✅ undefined인지 확인
    expect(value).not.toBeNull(); // ✅ 부정 matcher: null은 아님
    expect(value).not.toBeTruthy(); // ✅ 부정 matcher: Truthy가 아님
    expect(value).toBeFalsy(); // ✅ undefined는 거짓 같은 값(Falsy)임
  });

  test('일반 값들의 Truthy/Falsy 판별', () => {
    // Falsy 예시
    expect('').toBeFalsy(); // 빈 문자열은 Falsy
    expect(0).toBeFalsy(); // 숫자 0은 Falsy

    // Truthy 예시
    expect('Hello').toBeTruthy(); // 문자열이 있으면 Truthy
    expect(1).toBeTruthy(); // 0이 아닌 숫자는 Truthy
    expect([]).toBeTruthy(); // 빈 배열은 Truthy (JS 특징)
    expect({}).toBeTruthy(); // 빈 객체는 Truthy
  });
});
