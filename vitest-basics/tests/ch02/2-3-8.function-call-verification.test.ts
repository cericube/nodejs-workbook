import { it, expect, vi, describe } from 'vitest';

describe('함수 호출 행위 검증', () => {
  it('Spies & Mocks 실전 활용', () => {
    // 1. vi.fn은 구현을 대신하면서 호출 횟수와 인자를 기록하는 Mock 함수를 만듭니다.
    const sendNotification = vi.fn(
      (message: string, code?: number) => message.length > 0 && code !== undefined,
    );

    // 2. 함수 실행 (실제로는 특정 비즈니스 로직 내부에서 실행됨)
    sendNotification('결제가 완료되었습니다.', 200);
    sendNotification('배송이 시작되었습니다.', 300);

    // 3. 검증 시작
    // 최소 한 번은 실행되었는가?
    expect(sendNotification).toHaveBeenCalled();

    // 정확히 2번 실행되었는가?
    expect(sendNotification).toHaveBeenCalledTimes(2);

    // 첫 번째 호출 때 어떤 인자를 받았는가? (정밀 검증)
    // 첫 번째 호출만 지정하려면 toHaveBeenNthCalledWith를 사용해야 합니다.
    // 여기서는 두 호출 중 조건을 만족하는 호출이 하나라도 있는지 검사합니다.
    expect(sendNotification).toHaveBeenCalledWith('결제가 완료되었습니다.', expect.any(Number));

    // 가장 마지막 호출의 인자는 무엇인가?
    expect(sendNotification).toHaveBeenLastCalledWith('배송이 시작되었습니다.', 300);
  });

  it('객체 인자 검증 (Partial Matching)', () => {
    const updateUser = vi.fn();

    updateUser({ id: 1, name: 'Alice', role: 'admin' });

    // objectContaining으로 객체의 모든 속성을 나열하지 않고 관심 있는 필드만 검사합니다.
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }));
  });
});
