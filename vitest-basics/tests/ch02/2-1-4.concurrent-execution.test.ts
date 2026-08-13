import { describe, it, expect } from 'vitest';

/**
 * 지정한 시간(ms)만큼 비동기로 대기하는 유틸 함수
 * setTimeout을 Promise로 감싸 await 가능하게 만든다.
 */
export function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 기본 describe
 * → 내부 테스트들은 "순차적으로" 실행된다.
 * → 테스트 1이 끝나야 테스트 2가 시작됨
 */
describe('순차 실행 테스트', () => {
  it('테스트 1', async () => {
    await delay(100); // 100ms 대기
    expect(true).toBe(true);
  });

  it('테스트 2', async () => {
    await delay(100); // 테스트 1 완료 후 실행됨
    expect(true).toBe(true);
  });
});

/**
 * describe.concurrent
 * → 내부 테스트들이 "병렬로" 동시에 실행된다.
 * → 실행 순서는 보장되지 않음
 * → 공유 상태를 변경하는 테스트에는 경쟁 조건이 생길 수 있으므로 사용하지 않는다.
 */
describe.concurrent('병렬 실행 테스트', () => {
  it('테스트 A', async () => {
    console.log('[A] start:', Date.now()); // 시작 시각 기록
    await delay(1000); // 1초 대기
    console.log('[A] end:', Date.now()); // 종료 시각 기록
    expect(true).toBe(true);
  });

  it('테스트 B', async () => {
    console.log('[B] start:', Date.now()); // A와 거의 동시에 시작됨
    await delay(500); // 0.5초 대기
    console.log('[B] end:', Date.now()); // B가 A보다 먼저 끝남
    expect(true).toBe(true);
  });
});
