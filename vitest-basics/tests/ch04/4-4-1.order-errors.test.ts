import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/ch04/4-4-1.orders-app';
import type { FastifyInstance } from 'fastify';

// 에러 응답 JSON의 구체적인 필드를 assertion으로 검증하는 통합 테스트입니다.
// json()의 기본 any 반환에서 파생되는 unsafe 규칙만 이 파일에 한해 제외합니다.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('Orders API - 에러 응답 및 예외 상황 테스트', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('400 Bad Request - Validation Errors', () => {
    it('productId가 없으면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          // productId 누락
          quantity: 1,
          userId: 'user-1',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('상품 ID');
    });

    it('productId가 빈 문자열이면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: '   ',
          quantity: 1,
          userId: 'user-1',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.message).toContain('상품 ID');
    });

    it('quantity가 0 이하면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-1',
          quantity: 0,
          userId: 'user-1',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.message).toContain('1 이상');
      expect(body.details.field).toBe('quantity');
      expect(body.details.constraint).toContain('min: 1');
    });

    it('quantity가 100을 초과하면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-1',
          quantity: 101,
          userId: 'user-1',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.message).toContain('100을 초과');
      expect(body.details.received).toBe(101);
      expect(body.details.constraint).toContain('max: 100');
    });

    it('userId가 없으면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-1',
          quantity: 1,
          // userId 누락
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.message).toContain('사용자 ID');
    });

    it('여러 필드가 유효하지 않아도 첫 번째 에러만 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: '',
          quantity: -5,
          // userId도 누락
        },
      });

      expect(response.statusCode).toBe(400);
      // 첫 번째로 검증된 필드의 에러가 반환됨
    });
  });

  describe('404 Not Found', () => {
    it('존재하지 않는 주문 조회 시 404를 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/999',
      });

      expect(response.statusCode).toBe(404);

      const body = response.json();
      expect(body.error).toBe('NotFoundError');
      expect(body.code).toBe('NOT_FOUND');
      expect(body.message).toContain('주문');
      expect(body.details.resource).toBe('주문');
      expect(body.details.id).toBe('999');
    });

    it('존재하지 않는 주문 취소 시 404를 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/999/cancel',
      });

      expect(response.statusCode).toBe(404);
    });

    it('존재하지 않는 엔드포인트는 404를 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/nonexistent',
      });

      expect(response.statusCode).toBe(404);

      const body = response.json();
      expect(body.details.url).toBe('/api/nonexistent');
      expect(body.details.method).toBe('GET');
    });
  });

  describe('409 Conflict - Business Logic Errors', () => {
    it('중복 주문 생성 시 409를 반환합니다', async () => {
      // 첫 번째 주문 생성
      await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-duplicate',
          quantity: 1,
          userId: 'user-duplicate',
        },
      });

      // 동일한 주문 재시도
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-duplicate',
          quantity: 1,
          userId: 'user-duplicate',
        },
      });

      expect(response.statusCode).toBe(409);

      const body = response.json();
      expect(body.error).toBe('ConflictError');
      expect(body.code).toBe('CONFLICT');
      expect(body.message).toContain('이미 진행 중인');
      expect(body.details.existingOrderId).toBeDefined();
      expect(body.details.status).toBe('pending');
    });

    it('이미 취소된 주문을 다시 취소하면 409를 반환합니다', async () => {
      // 주문 생성
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-cancel-test',
          quantity: 1,
          userId: 'user-cancel-test',
        },
      });

      const orderId = createResponse.json().id;

      // 첫 번째 취소
      await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/cancel`,
      });

      // 두 번째 취소 시도
      const response = await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/cancel`,
      });

      expect(response.statusCode).toBe(409);

      const body = response.json();
      expect(body.message).toContain('이미 취소된');
      expect(body.details.status).toBe('cancelled');
    });

    it('배송 중인 주문을 취소하면 409를 반환합니다', async () => {
      // Arrange: 주문을 생성하고 확인한 뒤 배송 상태로 전환합니다.
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-shipped',
          quantity: 1,
          userId: 'user-shipped',
        },
      });

      const orderId = createResponse.json().id;

      // 주문 확인
      await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/confirm`,
      });

      await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/ship`,
      });

      // Act: 배송 중인 주문의 취소를 요청합니다.
      const response = await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/cancel`,
      });

      // Assert: assertion 없는 테스트는 항상 통과하므로 상태와 에러 계약을 모두 확인합니다.
      expect(response.statusCode).toBe(409);
      expect(response.json().details.status).toBe('shipped');
    });

    it('이미 확인된 주문을 다시 확인하면 409를 반환합니다', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-confirm-test',
          quantity: 1,
          userId: 'user-confirm-test',
        },
      });

      const orderId = createResponse.json().id;

      // 첫 번째 확인
      await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/confirm`,
      });

      // 두 번째 확인 시도
      const response = await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/confirm`,
      });

      expect(response.statusCode).toBe(409);

      const body = response.json();
      expect(body.details.currentStatus).toBe('confirmed');
      expect(body.details.expectedStatus).toBe('pending');
    });
  });

  describe('500 Internal Server Error', () => {
    it('시뮬레이션된 서버 에러는 500을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/simulate/error',
      });

      expect(response.statusCode).toBe(500);

      const body = response.json();
      expect(body.error).toBe('InternalServerError');
      expect(body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.message).toContain('서버 오류');
    });

    it('처리되지 않은 예외도 500으로 처리됩니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/simulate/unhandled',
      });

      expect(response.statusCode).toBe(500);

      const body = response.json();
      expect(body.error).toBe('InternalServerError');
      expect(body.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('에러 응답 형식 일관성', () => {
    it('모든 에러 응답은 동일한 구조를 갖습니다', async () => {
      const scenarios = [
        {
          description: '400 에러',
          method: 'POST' as const,
          url: '/api/orders',
          payload: { quantity: 0 },
        },
        {
          description: '404 에러',
          method: 'GET' as const,
          url: '/api/orders/999',
        },
        {
          description: '409 에러',
          method: 'POST' as const,
          url: '/api/orders/1/cancel',
          setup: async () => {
            // 주문을 먼저 취소하여 409 발생 조건 만들기
            await app.inject({
              method: 'POST',
              url: '/api/orders/1/cancel',
            });
          },
        },
      ];

      for (const scenario of scenarios) {
        if (scenario.setup) {
          await scenario.setup();
        }

        const response = await app.inject({
          method: scenario.method,
          url: scenario.url,
          ...(scenario.payload && { payload: scenario.payload }),
        });

        const body = response.json();

        // 공통 필드 검증
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('message');

        // error는 문자열
        expect(typeof body.error).toBe('string');
        // code는 대문자 스네이크 케이스
        expect(body.code).toMatch(/^[A-Z_]+$/);
        // message는 사용자 친화적인 메시지
        expect(typeof body.message).toBe('string');
        expect(body.message.length).toBeGreaterThan(0);
      }
    });

    it('details 필드는 선택적이며 추가 정보를 포함합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: '',
          quantity: 1,
          userId: 'user-1',
        },
      });

      const body = response.json();

      // 이 요청은 details를 제공하는 ValidationError를 유도하므로 존재 자체도 계약입니다.
      expect(body).toHaveProperty('details');
      expect(typeof body.details).toBe('object');
      expect(body.details).not.toBeNull();
    });
  });

  describe('에러 메시지 명확성', () => {
    it('에러 메시지는 문제를 명확히 설명합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-1',
          quantity: 150, // 최대값 초과
          userId: 'user-1',
        },
      });

      const body = response.json();

      // 메시지가 구체적인지 확인
      expect(body.message).toContain('100');
      expect(body.message).not.toBe('Invalid input'); // 너무 일반적인 메시지 지양
    });

    it('에러 세부 정보는 디버깅에 유용한 정보를 제공합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-1',
          quantity: -5,
          userId: 'user-1',
        },
      });

      const body = response.json();

      // 받은 값과 제약 조건이 명시되어 있는지 확인
      expect(body).toHaveProperty('details');
      expect(body.details.received).toBe(-5);
      expect(body.details.constraint).toBeDefined();
    });
  });

  describe('성공 케이스와의 대조', () => {
    it('유효한 요청은 201로 성공합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          productId: 'prod-valid',
          quantity: 5,
          userId: 'user-valid',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body).not.toHaveProperty('error');
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('status');
    });
  });
});
