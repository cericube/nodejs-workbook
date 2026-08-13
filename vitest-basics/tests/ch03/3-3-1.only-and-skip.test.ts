import { describe, it, expect } from 'vitest';

class Cart {
  items: Record<string, number> = {};

  add(productId: string, quantity: number) {
    if (quantity <= 0) throw new Error('수량은 0보다 커야 합니다.');
    this.items[productId] = (this.items[productId] ?? 0) + quantity;
  }
}

describe('장바구니 기능 테스트', () => {
  // .only를 붙이면 이 파일의 다른 테스트가 제외됩니다.
  // 디버깅 중에는 유용하지만 CI에서 테스트 누락을 만들 수 있으므로 커밋하지 않습니다.
  it('장바구니에 상품을 추가하면 수량이 증가해야 한다', () => {
    const cart = new Cart();
    cart.add('Apple', 1);
    expect(cart.items['Apple']).toBe(1);
  });

  it('상품 수량은 음수가 될 수 없다', () => {
    const cart = new Cart();
    expect(() => cart.add('Apple', -1)).toThrow();
  });

  // .skip은 테스트를 실행하지 않고 결과에 skipped로 기록합니다.
  // 장기간 방치하지 않도록 이슈 번호나 재활성화 조건을 함께 남기는 것이 좋습니다.
  it.skip('할인 쿠폰 적용 로직 (다음 스프린트 구현 예정)', () => {
    // 로직 미구현 상태에서도 전체 테스트 결과에 영향을 주지 않습니다.
  });
});
