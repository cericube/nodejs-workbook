import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { ConflictError, NotFoundError } from './4-4-1.app-errors';
import { errorHandler, notFoundHandler } from './4-4-1.error-handler';

interface Order {
  id: string;
  productId: string;
  quantity: number;
  status: 'pending' | 'cancelled';
}

const orders: Order[] = [{ id: '1', productId: 'product-1', quantity: 1, status: 'cancelled' }];

export function orderRoutes(app: FastifyInstance) {
  app.post<{
    Body: { productId: string; quantity: number };
  }>(
    '/api/orders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: { type: 'string', minLength: 1 },
            quantity: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    (request, reply) => {
      const order: Order = {
        id: String(orders.length + 1),
        ...request.body,
        status: 'pending',
      };

      orders.push(order);
      return reply.code(201).send(order);
    },
  );

  app.get<{ Params: { id: string } }>('/api/orders/:id', (request) => {
    const order = orders.find(({ id }) => id === request.params.id);

    if (!order) {
      throw new NotFoundError('주문', request.params.id);
    }

    return order;
  });

  app.post<{ Params: { id: string } }>('/api/orders/:id/cancel', (request) => {
    const order = orders.find(({ id }) => id === request.params.id);

    if (!order) {
      throw new NotFoundError('주문', request.params.id);
    }

    if (order.status === 'cancelled') {
      throw new ConflictError('이미 취소된 주문입니다', {
        orderId: order.id,
        status: order.status,
      });
    }

    order.status = 'cancelled';
    return order;
  });

  app.get('/api/simulate-unhandled-error', () => {
    throw new TypeError('예상하지 못한 오류');
  });
}

export function buildApp() {
  const app = Fastify();

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.register(orderRoutes);

  return app;
}
