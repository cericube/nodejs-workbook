import type { FastifyInstance } from 'fastify';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalServerError,
} from './4-4-1.app-errors';

import { errorHandler, notFoundHandler } from './4-4-1.error-handler';

interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  createdAt: string;
}

const orders: Order[] = [
  {
    id: '1',
    userId: 'user-1',
    productId: 'prod-1',
    quantity: 2,
    status: 'pending',
    total: 100,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

export function orderRoutes(app: FastifyInstance) {
  // 주문 생성
  app.post<{
    Body: {
      productId: string;
      quantity: number;
      userId: string;
    };
  }>('/api/orders', (request, reply) => {
    const { productId, quantity, userId } = request.body;

    // 입력 검증
    if (!productId || productId.trim() === '') {
      const error = new ValidationError('상품 ID는 필수입니다', {
        field: 'productId',
        received: productId,
      });
      throw error;
    }

    if (!quantity || quantity <= 0) {
      throw new ValidationError('수량은 1 이상이어야 합니다', {
        field: 'quantity',
        received: quantity,
        constraint: 'min: 1',
      });
    }

    if (quantity > 100) {
      throw new ValidationError('수량은 100을 초과할 수 없습니다', {
        field: 'quantity',
        received: quantity,
        constraint: 'max: 100',
      });
    }

    if (!userId) {
      throw new ValidationError('사용자 ID는 필수입니다');
    }

    // 비즈니스 로직 검증
    const existingOrder = orders.find(
      (o) => o.userId === userId && o.productId === productId && o.status === 'pending',
    );

    if (existingOrder) {
      throw new ConflictError('이미 진행 중인 주문이 있습니다', {
        existingOrderId: existingOrder.id,
        status: existingOrder.status,
      });
    }

    // 주문 생성
    const newOrder: Order = {
      id: String(orders.length + 1),
      userId,
      productId,
      quantity,
      status: 'pending',
      total: quantity * 50, // 가격 계산
      createdAt: new Date().toISOString(),
    };

    orders.push(newOrder);

    reply.code(201);
    return newOrder;
  });

  // 주문 조회
  app.get<{ Params: { id: string } }>('/api/orders/:id', (request) => {
    const { id } = request.params;
    const order = orders.find((o) => o.id === id);

    if (!order) {
      throw new NotFoundError('주문', id);
    }

    return order;
  });

  // 주문 취소
  app.post<{ Params: { id: string } }>('/api/orders/:id/cancel', (request) => {
    const { id } = request.params;
    const order = orders.find((o) => o.id === id);

    if (!order) {
      throw new NotFoundError('주문', id);
    }

    // 이미 취소된 주문
    if (order.status === 'cancelled') {
      throw new ConflictError('이미 취소된 주문입니다', {
        orderId: id,
        status: order.status,
      });
    }

    // 배송 중인 주문은 취소 불가
    if (order.status === 'shipped' || order.status === 'delivered') {
      throw new ConflictError(
        `${order.status === 'shipped' ? '배송 중' : '배송 완료'}인 주문은 취소할 수 없습니다`,
        {
          orderId: id,
          status: order.status,
          allowedStatuses: ['pending', 'confirmed'],
        },
      );
    }

    order.status = 'cancelled';
    return order;
  });

  // 주문 확인
  app.post<{ Params: { id: string } }>('/api/orders/:id/confirm', (request) => {
    const { id } = request.params;
    const order = orders.find((o) => o.id === id);

    if (!order) {
      throw new NotFoundError('주문', id);
    }

    if (order.status !== 'pending') {
      throw new ConflictError('대기 중인 주문만 확인할 수 있습니다', {
        orderId: id,
        currentStatus: order.status,
        expectedStatus: 'pending',
      });
    }

    order.status = 'confirmed';
    return order;
  });

  // 배송 시작: 확인된 주문만 shipped 상태로 전환합니다.
  app.post<{ Params: { id: string } }>('/api/orders/:id/ship', (request) => {
    const order = orders.find((item) => item.id === request.params.id);

    if (!order) throw new NotFoundError('주문', request.params.id);
    if (order.status !== 'confirmed') {
      throw new ConflictError('확인된 주문만 배송할 수 있습니다', {
        currentStatus: order.status,
        expectedStatus: 'confirmed',
      });
    }

    order.status = 'shipped';
    return order;
  });

  // 시뮬레이션: 예상치 못한 에러
  app.get('/api/orders/simulate/error', () => {
    // 의도적으로 에러 발생
    throw new InternalServerError('시뮬레이션된 서버 오류', {
      timestamp: new Date().toISOString(),
    });
  });

  // 시뮬레이션: 처리되지 않은 예외
  app.get('/api/orders/simulate/unhandled', () => {
    // 일반 Error도 전역 핸들러가 안전한 500 응답으로 변환하는지 확인하기 위한 경로입니다.
    throw new TypeError('시뮬레이션된 처리되지 않은 예외');
  });
}

/////////////////////////////////////////////
import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify();

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.register(orderRoutes);

  return app;
}
