import { describe, it, expect } from 'vitest';

describe('값 비교 Matcher', () => {
  describe('toBe - Object.is 동일성 비교', () => {
    it('숫자를 비교한다', () => {
      // toBe는 Object.is를 사용하며 원시값 또는 같은 객체 참조를 비교할 때 적합합니다.
      expect(2 + 2).toBe(4);

      // 부동소수점 오차로 인해 정확히 0.3이 아님
      expect(0.1 + 0.2).not.toBe(0.3);
    });

    it('문자열을 비교한다', () => {
      // 문자열도 Object.is로 값을 비교
      expect('hello').toBe('hello');

      // 대소문자까지 정확히 일치해야 함
      expect('Hello').not.toBe('hello');
    });

    it('불린값을 비교한다', () => {
      // boolean 값 비교
      expect(true).toBe(true);

      // 표현식 결과도 boolean으로 평가
      expect(1 > 0).toBe(true);
    });

    it('null과 undefined를 비교한다', () => {
      // null은 null과만 동일
      expect(null).toBe(null);

      // undefined는 undefined와만 동일
      expect(undefined).toBe(undefined);

      // null !== undefined
      expect(null).not.toBe(undefined);
    });
  });

  describe('toEqual - 깊은 비교', () => {
    it('객체의 값을 비교한다', () => {
      const user1 = { name: 'John', age: 30 };
      const user2 = { name: 'John', age: 30 };

      // 객체 내부 값(프로퍼티 구조)을 재귀적으로 비교
      expect(user1).toEqual(user2);

      // 서로 다른 객체 참조이므로 === 비교는 실패
      expect(user1).not.toBe(user2);
    });

    it('배열을 비교한다', () => {
      // 배열 요소를 순서대로 깊은 비교
      expect([1, 2, 3]).toEqual([1, 2, 3]);

      // 새 배열 리터럴은 항상 다른 참조
      expect([1, 2, 3]).not.toBe([1, 2, 3]);
    });

    it('중첩된 객체를 비교한다', () => {
      const data = {
        user: { name: 'John', address: { city: 'Seoul' } },
        items: [1, 2, 3],
      };

      // 중첩 구조까지 재귀적으로 값 비교
      expect(data).toEqual({
        user: { name: 'John', address: { city: 'Seoul' } },
        items: [1, 2, 3],
      });
    });
  });

  describe('toStrictEqual - 엄격한 비교', () => {
    it('undefined 프로퍼티를 구분한다', () => {
      const obj1 = { a: 1, b: undefined };
      const obj2 = { a: 1 };

      // toEqual은 undefined 프로퍼티 차이를 무시
      expect(obj1).toEqual(obj2);

      // toStrictEqual은 프로퍼티 존재 여부까지 비교
      expect(obj1).not.toStrictEqual(obj2);
    });

    it('배열의 빈 요소를 구분한다', () => {
      // 희소 배열의 빈 슬롯(hole)을 의도적으로 만드는 비교 예제입니다.
      // eslint-disable-next-line no-sparse-arrays
      const arr1 = [1, , 3]; // 실제로는 hole(빈 슬롯)
      const arr2 = [1, undefined, 3]; // 명시적 undefined

      // toEqual은 둘을 동일하게 취급
      expect(arr1).toEqual(arr2);

      // toStrictEqual은 hole과 undefined를 구분
      expect(arr1).not.toStrictEqual(arr2);
    });
  });

  describe('숫자 비교', () => {
    it('크기를 비교한다', () => {
      // 크기 비교 matcher
      expect(10).toBeGreaterThan(5);
      expect(10).toBeGreaterThanOrEqual(10);
      expect(5).toBeLessThan(10);
      expect(5).toBeLessThanOrEqual(5);
    });

    it('부동소수점을 안전하게 비교한다', () => {
      // 오차 허용 범위 내에서 비교
      expect(0.1 + 0.2).toBeCloseTo(0.3);

      // 두 번째 인자는 허용 오차를 결정하는 소수 자릿수(기본값 2)
      expect(0.1 + 0.2).toBeCloseTo(0.3, 5);
    });

    it('NaN을 검사한다', () => {
      // NaN 전용 matcher
      expect(NaN).toBeNaN();
      expect(0 / 0).toBeNaN();
      expect(10).not.toBeNaN();
    });
  });

  describe('타입 검사', () => {
    it('원시 타입을 검사한다', () => {
      // typeof 기반 타입 검사
      expect(42).toBeTypeOf('number');
      expect('hello').toBeTypeOf('string');
      expect(true).toBeTypeOf('boolean');
      expect(undefined).toBeTypeOf('undefined');
      expect(Symbol()).toBeTypeOf('symbol');
    });

    it('객체 타입을 검사한다', () => {
      // instanceof 기반 클래스 타입 검사
      expect({}).toBeInstanceOf(Object);
      expect([]).toBeInstanceOf(Array);
      expect(new Date()).toBeInstanceOf(Date);
      expect(/regex/).toBeInstanceOf(RegExp);
    });
  });

  describe('존재 검사', () => {
    it('정의 여부를 검사한다', () => {
      // undefined가 아닌지만 확인
      expect(42).toBeDefined();
      expect(undefined).toBeUndefined();
    });

    it('null 여부를 검사한다', () => {
      // null인지 정확히 확인
      expect(null).toBeNull();
      expect(undefined).not.toBeNull();
    });

    it('truthy/falsy를 검사한다', () => {
      // JS에서 true로 평가되는 값
      expect(1).toBeTruthy();
      expect('hello').toBeTruthy();
      expect({}).toBeTruthy();

      // JS에서 false로 평가되는 값
      expect(0).toBeFalsy();
      expect('').toBeFalsy();
      expect(null).toBeFalsy();
      expect(undefined).toBeFalsy();
      expect(false).toBeFalsy();
    });
  });
});
