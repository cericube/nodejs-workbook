import { prisma } from '../shared/prisma.js';
import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/** 주문 생성에 필요한 사용자 ID와 결제 금액을 전달하는 입력 타입입니다. */
export type CreateOrderInput = {
  userId: number;
  totalPrice: number;
};

/** Redis Stream에 기록할 수 있는 주문 이벤트의 종류입니다. */
export type OrderEventType = 'order.created' | 'order.paid' | 'order.cancelled' | 'order.shipped';

/** 주문과 Stream 이벤트에서 사용할 수 있는 주문 상태입니다. */
export type OrderStatus = 'CREATED' | 'PAID' | 'CANCELLED' | 'SHIPPED';

/** Redis Stream 메시지를 애플리케이션에서 사용하기 쉬운 값으로 변환한 출력 타입입니다. */
export type OrderEventOutput = {
  id: string;
  eventType: OrderEventType;
  orderId: number;
  userId: number;
  status: OrderStatus;
  totalPrice: number;
  createdAt: string;
};

/** 주문 상태와 Stream 이벤트 종류의 대응 관계를 한 곳에서 관리합니다. */
const OrderEventTypeByStatus: Record<OrderStatus, OrderEventType> = {
  CREATED: 'order.created',
  PAID: 'order.paid',
  CANCELLED: 'order.cancelled',
  SHIPPED: 'order.shipped',
};

/** unknown 값이 문자열 key를 가진 객체인지 확인합니다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Stream 메시지에서 필수 문자열 필드를 읽고 누락되거나 타입이 다른 값을 거부합니다. */
function getRequiredStringField(message: Record<string, unknown>, field: string): string {
  const value = message[field];

  if (typeof value !== 'string') {
    throw new Error(`주문 Stream 메시지의 ${field} 필드가 유효하지 않습니다.`);
  }

  return value;
}

/** 문자열 필드를 지정한 최솟값 이상의 안전한 정수로 변환합니다. */
function getSafeIntegerField(
  message: Record<string, unknown>,
  field: string,
  minimum: number,
): number {
  const value = Number(getRequiredStringField(message, field));

  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`주문 Stream 메시지의 ${field} 필드가 유효하지 않습니다.`);
  }

  return value;
}

/** Stream 문자열이 지원하는 주문 이벤트 종류인지 확인합니다. */
function isOrderEventType(value: string): value is OrderEventType {
  return ['order.created', 'order.paid', 'order.cancelled', 'order.shipped'].includes(value);
}

/** Stream 문자열이 지원하는 주문 상태인지 확인합니다. */
function isOrderStatus(value: string): value is OrderStatus {
  return ['CREATED', 'PAID', 'CANCELLED', 'SHIPPED'].includes(value);
}

/**
 * Redis Stream에서 조회한 주문 이벤트를 서비스 출력 형태로 변환합니다.
 *
 * 1. Stream 메시지 ID를 이벤트 ID로 사용합니다.
 * 2. 문자열로 저장된 주문 ID, 사용자 ID, 결제 금액을 number 타입으로 변환합니다.
 * 3. 이벤트 종류와 주문 상태를 허용 목록과 비교하고 잘못된 메시지는 거부합니다.
 *
 * 실습 포인트:
 * Redis Stream의 필드와 값은 문자열로 저장되므로 서비스 경계에서 필요한 타입으로 변환합니다.
 */
function parseOrderEvent(entry: unknown): OrderEventOutput {
  if (!isRecord(entry) || typeof entry.id !== 'string' || !isRecord(entry.message)) {
    throw new Error('주문 Stream 항목의 형식이 유효하지 않습니다.');
  }

  const eventType = getRequiredStringField(entry.message, 'eventType');

  if (!isOrderEventType(eventType)) {
    throw new Error('주문 Stream 메시지의 eventType 필드가 유효하지 않습니다.');
  }

  const status = getRequiredStringField(entry.message, 'status');

  if (!isOrderStatus(status)) {
    throw new Error('주문 Stream 메시지의 status 필드가 유효하지 않습니다.');
  }

  return {
    id: entry.id,
    eventType,
    orderId: getSafeIntegerField(entry.message, 'orderId', 1),
    userId: getSafeIntegerField(entry.message, 'userId', 1),
    status,
    totalPrice: getSafeIntegerField(entry.message, 'totalPrice', 0),
    createdAt: getRequiredStringField(entry.message, 'createdAt'),
  };
}

/** DB 주문 상태 변경과 Redis Stream 주문 이벤트 기록을 연결하는 서비스입니다. */
export class OrderStreamService {
  /**
   * 주문을 생성하고 주문 생성 이벤트를 기록합니다.
   *
   * 1. Order 테이블에 주문을 저장합니다.
   * 2. 주문 생성 결과를 기준으로 Redis Stream에 order.created 이벤트를 기록합니다.
   * 3. 생성된 주문 정보를 반환합니다.
   *
   * 실습 포인트:
   * DB는 현재 주문 상태의 원본 저장소입니다.
   * Redis Stream은 주문 생성 사실을 다른 worker나 서비스가 나중에 처리할 수 있도록 남기는 이벤트 로그입니다.
   *
   * 참고:
   * DB 저장 후 Stream 기록에 실패할 수 있으므로 실무에서는 Outbox Pattern 등으로 두 저장소의 정합성을 보완할 수 있습니다.
   */
  async createOrder(input: CreateOrderInput) {
    const order = await prisma.order.create({
      data: {
        userId: input.userId,
        totalPrice: input.totalPrice,
        status: 'CREATED',
      },
    });

    await this.addOrderEvent({
      eventType: 'order.created',
      orderId: order.id,
      userId: order.userId,
      status: 'CREATED',
      totalPrice: order.totalPrice,
    });

    return order;
  }

  /**
   * 주문 이벤트를 Redis Stream에 추가합니다.
   *
   * 1. 숫자 필드를 Stream 값으로 저장할 문자열로 변환합니다.
   * 2. XADD의 `*`를 사용해 Redis가 메시지 ID를 자동 생성하게 합니다.
   * 3. 생성된 Stream 메시지 ID를 반환합니다.
   *
   * 실습 포인트:
   * Stream 메시지는 명시적으로 삭제하거나 보존 길이를 제한하지 않는 한 Redis에 로그처럼 남습니다.
   * 따라서 나중에 XRANGE로 다시 조회하거나 Consumer Group으로 처리할 수 있습니다.
   *
   * 참고:
   * 현재 XADD에는 MAXLEN이 없으므로 운영 환경에서는 보존 기간이나 최대 길이 정책이 필요합니다.
   */
  async addOrderEvent(input: {
    eventType: OrderEventType;
    orderId: number;
    userId: number;
    status: OrderStatus;
    totalPrice: number;
  }): Promise<string> {
    const key = RedisKey.stream.orders();

    // 숫자를 문자열로 직렬화하고 서버가 생성한 ID로 이벤트를 추가합니다.
    const messageId = await redis.xAdd(key, '*', {
      eventType: input.eventType,
      orderId: String(input.orderId),
      userId: String(input.userId),
      status: input.status,
      totalPrice: String(input.totalPrice),
      createdAt: new Date().toISOString(),
    });

    return messageId;
  }

  /**
   * Redis Stream에 기록된 주문 이벤트 목록을 조회합니다.
   *
   * 1. Stream의 처음부터 끝까지 이벤트를 조회합니다.
   * 2. COUNT 옵션으로 반환할 최대 메시지 수를 제한합니다.
   * 3. 각 메시지의 문자열 필드를 서비스 출력 타입으로 변환합니다.
   *
   * 실습 포인트:
   * Pub/Sub과 달리 Stream은 이미 발행된 이벤트도 다시 조회할 수 있습니다.
   *
   * 참고:
   * XRANGE는 오래된 메시지부터 조회하므로 count는 최근 이벤트 수가 아니라 처음부터 조회할 최대 개수를 의미합니다.
   * 이 조회는 Consumer Group이나 Pending 상태에 영향을 주지 않습니다.
   */
  async getOrderEvents(count = 10): Promise<OrderEventOutput[]> {
    const key = RedisKey.stream.orders();

    // '-'와 '+'는 각각 Stream의 최소 ID와 최대 ID 범위를 뜻합니다.
    const entries = await redis.xRange(key, '-', '+', {
      COUNT: count,
    });

    return entries.map(parseOrderEvent);
  }

  /**
   * 주문 상태를 변경하고 상태 변경 이벤트를 기록합니다.
   *
   * 1. DB에서 지정한 주문의 상태를 수정합니다.
   * 2. 변경된 상태에 대응하는 이벤트 종류를 결정합니다.
   * 3. 수정된 주문 정보를 Redis Stream에 기록합니다.
   *
   * 실습 포인트:
   * DB에는 현재 상태를 저장하고 Stream에는 상태가 변경된 이력을 순서대로 남깁니다.
   *
   * 참고:
   * OrderStatus 타입과 상태별 매핑을 사용하므로 정의되지 않은 상태는 이벤트로 기록할 수 없습니다.
   * DB 갱신 후 XADD가 실패할 수 있으므로 상태 변경 이벤트에도 Outbox Pattern 적용을 고려해야 합니다.
   */
  async changeOrderStatus(orderId: number, status: OrderStatus): Promise<void> {
    const order = await prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status,
      },
    });

    // 허용된 주문 상태를 대응하는 Stream 이벤트 종류로 변환합니다.
    const eventType = OrderEventTypeByStatus[status];

    await this.addOrderEvent({
      eventType,
      orderId: order.id,
      userId: order.userId,
      status,
      totalPrice: order.totalPrice,
    });
  }
}
