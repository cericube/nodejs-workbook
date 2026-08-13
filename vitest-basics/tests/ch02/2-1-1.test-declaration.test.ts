import { describe, it, expect } from 'vitest';

/**
 * 문자열의 첫 글자를 대문자로 변환하는 함수
 * - 빈 문자열이면 빈 문자열 반환
 */
function capitalize(str: string): string {
  if (!str) return ''; // 입력이 없으면 그대로 반환
  return (
    str.charAt(0).toUpperCase() + // 첫 글자만 대문자로 변환
    str.slice(1)
  ); // 나머지 문자열을 이어 붙임
}

/**
 * 문자열을 지정된 길이만큼 자르는 함수
 * - maxLength보다 길면 "..."을 뒤에 붙임
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str; // 이미 짧으면 그대로 반환
  return str.slice(0, maxLength) + '...'; // 지정 길이까지 자르고 ... 추가
}

/**
 * 문자열 유틸리티 테스트 그룹(Test Suite)
 * describe는 관련 테스트를 논리적으로 묶는 역할
 */
describe('문자열 유틸리티', () => {
  /**
   * capitalize 함수 테스트 그룹
   */
  describe('capitalize 함수', () => {
    it('첫 글자를 대문자로 변환한다.', () => {
      // 실행(Act) 결과를 기대값과 비교(Assert)합니다.
      expect(capitalize('hello')).toBe('Hello');
    });

    it('빈 문자열은 빈 문자열을 반환한다', () => {
      expect(capitalize('')).toBe('');
    });

    it('이미 대문자인 경우 그대로 반환한다', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });
  });

  /**
   * truncate 함수 테스트 그룹
   */
  describe('truncate 함수', () => {
    it('지정된 길이로 문자열을 자른다', () => {
      // Arrange(입력 준비)와 Act(함수 실행)
      const result = truncate('Hello World', 5);
      // Assert: 앞에서 5글자와 말줄임표가 이어지는지 확인
      expect(result).toBe('Hello...');
    });

    it('문자열이 더 짧으면 그대로 반환한다', () => {
      const result = truncate('Hi', 10);
      // maxLength보다 짧으면 변경되지 않아야 함
      expect(result).toBe('Hi');
    });
  });
});
