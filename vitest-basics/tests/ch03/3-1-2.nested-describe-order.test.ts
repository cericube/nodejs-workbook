import { describe, beforeEach, it, expect } from 'vitest';

// 훅의 실제 호출 순서를 기록합니다. 로그만 확인하는 대신 assertion으로 동작을 보장합니다.
const executionOrder: string[] = [];

describe('outer', () => {
  beforeEach(() => {
    executionOrder.length = 0;
    executionOrder.push('outer beforeEach');
  });

  describe('inner', () => {
    beforeEach(() => {
      executionOrder.push('inner beforeEach');
    });

    it('test', () => {
      executionOrder.push('test case body');

      // 중첩 훅은 바깥쪽에서 안쪽 순으로 실행된 뒤 테스트 본문이 실행됩니다.
      expect(executionOrder).toEqual(['outer beforeEach', 'inner beforeEach', 'test case body']);
    });
  });
});
