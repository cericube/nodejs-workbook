import axios from 'axios';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type OrderParams = {
  id: string;
};

type UpdateOrderBody = {
  amount: number;
};

// 하나의 핸들러에서 Path, Query String, Body에 따라 응답을 동적으로 나눕니다.
const server = setupServer(
  http.patch<OrderParams, UpdateOrderBody>(
    'https://api.shop.com/orders/:id',
    async ({ params, request }) => {
      // 1. Path Parameter로 존재하지 않는 주문을 표현합니다.
      if (params.id === 'invalid-id') {
        return HttpResponse.json({ error: '존재하지 않는 주문입니다.' }, { status: 404 });
      }

      // 2. URL 객체를 사용해 confirm Query Parameter를 검사합니다.
      const url = new URL(request.url);
      if (url.searchParams.get('confirm') !== 'true') {
        return HttpResponse.json({ error: '확인 플래그(confirm)가 필요합니다.' }, { status: 400 });
      }

      // 3. JSON Body를 읽어 결제 금액에 관한 비즈니스 규칙을 검사합니다.
      const body = await request.json();
      if (body.amount <= 0) {
        return HttpResponse.json({ error: '금액은 0보다 커야 합니다.' }, { status: 422 });
      }

      // 모든 조건을 통과한 경우에만 성공 응답을 반환합니다.
      return HttpResponse.json({
        orderId: params.id,
        status: 'SUCCESS',
        paidAmount: body.amount,
        message: '주문이 성공적으로 처리되었습니다.',
      });
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

// Axios의 4xx 응답도 테스트에서 직접 비교할 수 있도록 공통 요청 함수를 만듭니다.
const requestOrder = (id: string, amount: number, confirm = true) =>
  axios.patch(
    `https://api.shop.com/orders/${id}`,
    { amount },
    {
      params: { confirm },
      validateStatus: () => true,
    },
  );

describe('주문 API 동적 핸들러', () => {
  it('유효한 요청을 성공적으로 처리합니다', async () => {
    const response = await requestOrder('order-1', 10_000);

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      orderId: 'order-1',
      status: 'SUCCESS',
      paidAmount: 10_000,
    });
  });

  // 같은 요청 형식에서 입력만 바뀌는 오류 사례는 it.each로 중복을 줄입니다.
  it.each([
    {
      condition: '존재하지 않는 주문',
      id: 'invalid-id',
      amount: 10_000,
      confirm: true,
      status: 404,
    },
    { condition: 'confirm이 false', id: 'order-1', amount: 10_000, confirm: false, status: 400 },
    { condition: '0 이하의 금액', id: 'order-1', amount: 0, confirm: true, status: 422 },
  ])('$condition이면 $status로 응답합니다', async ({ id, amount, confirm, status }) => {
    const response = await requestOrder(id, amount, confirm);

    expect(response.status).toBe(status);
  });
});
