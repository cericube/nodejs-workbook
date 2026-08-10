// tests/ch10/order-stream.service.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { OrderStreamService } from '../../src/ch10/order-stream.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

/** 주문 DB 변경과 Redis Stream 이벤트 기록, 조회 순서 및 메시지 검증을 확인합니다. */
describe('OrderStreamService', () => {
  const service = new OrderStreamService();
  let userId: number;

  beforeEach(async () => {
    // Order의 외래 키 조건을 충족하는 사용자를 각 테스트에 준비합니다.
    const user = await prisma.user.create({
      data: { email: 'stream-order-user@example.com', name: '주문 사용자' },
    });
    userId = user.id;
  });

  it('주문을 DB에 생성하고 order.created 이벤트를 기록한다', async () => {
    // 하나의 서비스 호출이 영속 데이터와 후속 처리용 이벤트를 모두 생성하는지 확인합니다.
    const order = await service.createOrder({ userId, totalPrice: 25_000 });

    const events = await service.getOrderEvents();

    expect(order).toMatchObject({ userId, status: 'CREATED', totalPrice: 25_000 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'order.created',
      orderId: order.id,
      userId,
      status: 'CREATED',
      totalPrice: 25_000,
    });
  });

  it('주문 이벤트를 오래된 ID 순서로 지정한 개수만큼 조회한다', async () => {
    await service.addOrderEvent({
      eventType: 'order.created',
      orderId: 1,
      userId,
      status: 'CREATED',
      totalPrice: 10_000,
    });
    await service.addOrderEvent({
      eventType: 'order.paid',
      orderId: 1,
      userId,
      status: 'PAID',
      totalPrice: 10_000,
    });

    // XRANGE는 최소 ID부터 읽으므로 COUNT 1이면 최초 생성 이벤트만 반환합니다.
    const events = await service.getOrderEvents(1);

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('order.created');
  });

  it('주문 상태를 변경하고 대응하는 이벤트 종류를 기록한다', async () => {
    const order = await service.createOrder({ userId, totalPrice: 50_000 });

    await service.changeOrderStatus(order.id, 'PAID');
    await service.changeOrderStatus(order.id, 'SHIPPED');

    // 최종 DB 상태와 상태 전이별 이벤트 이력이 같은 순서로 남아야 합니다.
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const events = await service.getOrderEvents();
    expect(updatedOrder.status).toBe('SHIPPED');
    expect(events.map((event) => event.eventType)).toEqual([
      'order.created',
      'order.paid',
      'order.shipped',
    ]);
  });

  it('유효하지 않은 숫자 필드가 저장된 이벤트를 거부한다', async () => {
    // 서비스 타입을 우회한 외부 producer의 손상 메시지를 직접 Stream에 기록합니다.
    await redis.xAdd(RedisKey.stream.orders(), '*', {
      eventType: 'order.created',
      orderId: 'invalid',
      userId: String(userId),
      status: 'CREATED',
      totalPrice: '1000',
      createdAt: new Date().toISOString(),
    });

    await expect(service.getOrderEvents()).rejects.toThrow('orderId 필드');
  });

  it('지원하지 않는 주문 상태가 저장된 이벤트를 거부한다', async () => {
    await redis.xAdd(RedisKey.stream.orders(), '*', {
      eventType: 'order.created',
      orderId: '1',
      userId: String(userId),
      status: 'UNKNOWN',
      totalPrice: '1000',
      createdAt: new Date().toISOString(),
    });

    await expect(service.getOrderEvents()).rejects.toThrow('status 필드');
  });
});
