import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/ch04/4-4-1.orders-app';

describe('에러 응답 및 예외 상황 테스트', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Schema Validation에 실패하면 400을 반환합니다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/orders',
      body: { productId: 'product-2', quantity: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'ValidationError',
      code: 'VALIDATION_ERROR',
      message: '입력 데이터가 유효하지 않습니다',
    });
  });

  it('존재하지 않는 주문이면 404를 반환합니다', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/999',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NotFoundError',
      code: 'NOT_FOUND',
      message: '주문 999을(를) 찾을 수 없습니다',
      details: { resource: '주문', id: '999' },
    });
  });

  it('이미 취소된 주문을 취소하면 409를 반환합니다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/1/cancel',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'ConflictError',
      code: 'CONFLICT',
      message: '이미 취소된 주문입니다',
    });
  });

  it('처리하지 않은 예외는 공통 500 응답으로 변환합니다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await app.inject({
      method: 'GET',
      url: '/api/simulate-unhandled-error',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'InternalServerError',
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 내부 오류가 발생했습니다',
    });

    consoleError.mockRestore();
  });

  it('존재하지 않는 Route는 공통 404 응답을 반환합니다', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/unknown',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NotFound',
      code: 'NOT_FOUND',
      message: '요청한 리소스를 찾을 수 없습니다',
      details: { url: '/api/unknown', method: 'GET' },
    });
  });
});
