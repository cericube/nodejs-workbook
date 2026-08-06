// src/ch06/product-hash.service.ts

import { prisma } from '../shared/prisma.js';
import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import type { Prisma } from '../generated/prisma/client';

/**
 * 상품 재고 조회 시 공통으로 사용할 Prisma select 옵션
 *
 * 1. Redis Hash에 저장할 상품 재고 관련 필드만 가져옵니다.
 * 2. create/find/update 메서드에서 같은 select를 재사용합니다.
 * 3. DB에서 가져오는 필드와 Redis Hash에 저장하는 필드가 어긋나는 실수를 줄입니다.
 */
const ProductStockSelect: Prisma.ProductSelect = {
  id: true,
  name: true,
  stock: true,
  status: true,
  updatedAt: true,
};

// Redis Hash에 저장하고 서비스 밖으로 반환할 상품 재고 상태 형태입니다.
export type ProductStockOutput = {
  productId: number;
  name: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  status: string;
  updatedAt: string;
};

// 상품 생성 시 입력으로 받을 수 있는 필드들입니다.
export type CreateProductInput = {
  name: string;
  stock: number;
  status?: string;
};

// 상품 재고 수정 시 입력으로 받을 수 있는 필드들입니다.
export type UpdateProductStockInput = {
  stock?: number;
  reservedStock?: number;
  status?: string;
};

/**
 * Prisma Product 조회 결과를 상품 재고 응답 형태로 변환
 *
 * Prisma는 updatedAt을 Date 객체로 반환합니다.
 * Redis Hash와 API 응답에서는 문자열이 다루기 쉬우므로 ISO 문자열로 변환합니다.
 *
 * reservedStock은 DB 컬럼이 아니라 Redis Hash 실습용 임시 예약 수량입니다.
 * availableStock은 stock에서 reservedStock을 뺀 값으로 계산합니다.
 */
function toProductStockOutput(
  product: {
    id: number;
    name: string;
    stock: number;
    status: string;
    updatedAt: Date;
  },
  reservedStock = 0,
): ProductStockOutput {
  return {
    productId: product.id,
    name: product.name,
    stock: product.stock,
    reservedStock,
    availableStock: product.stock - reservedStock,
    status: product.status,
    updatedAt: product.updatedAt.toISOString(),
  };
}

/**
 * Redis Hash 조회 결과를 ProductStockOutput 형태로 변환
 *
 * hGetAll은 Hash가 없을 때 빈 객체를 반환합니다.
 * 빈 객체는 캐시 미스로 판단할 수 있도록 null로 변환합니다.
 *
 * Redis Hash의 값은 문자열로 저장되므로 숫자 필드는 Number로 다시 변환합니다.
 */
function parseProductStockHash(hash: Record<string, string>): ProductStockOutput | null {
  if (Object.keys(hash).length === 0) {
    return null;
  }

  const productId = Number(hash.productId);
  const stock = Number(hash.stock);
  const reservedStock = Number(hash.reservedStock);
  const availableStock = Number(hash.availableStock);
  const { name, status, updatedAt } = hash;

  // 일부 필드만 남았거나 숫자 필드가 손상된 Hash는 캐시 미스로 처리합니다.
  // 호출부는 DB 원본을 조회해 정상 Hash를 다시 생성할 수 있습니다.
  if (
    !Number.isInteger(productId) ||
    !Number.isInteger(stock) ||
    !Number.isInteger(reservedStock) ||
    !Number.isInteger(availableStock) ||
    availableStock !== stock - reservedStock ||
    name === undefined ||
    status === undefined ||
    updatedAt === undefined
  ) {
    return null;
  }

  return {
    productId,
    name,
    stock,
    reservedStock,
    availableStock,
    status,
    updatedAt,
  };
}

export class ProductHashService {
  /** 재고 값이 0 이상의 정수인지 검증합니다. */
  private validateStock(stock: number, fieldName: 'stock' | 'reservedStock'): void {
    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error(`${fieldName} must be a non-negative integer`);
    }
  }

  /**
   * 예약 재고 증감에 사용할 수량을 검증합니다.
   * 음수 수량은 증가와 감소의 의미를 뒤집고, 소수는 정수형 재고와 맞지 않습니다.
   */
  private validateQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('quantity must be a positive integer');
    }
  }

  /**
   * 상품 생성
   *
   * 1. 전달받은 name/stock/status로 DB에 상품을 생성합니다.
   * 2. ProductStockSelect로 필요한 필드만 다시 가져옵니다.
   * 3. Prisma 결과를 ProductStockOutput 형태로 변환합니다.
   * 4. 생성된 상품 재고 상태를 Redis Hash에 저장합니다.
   *
   * 실습 포인트:
   * DB 저장 결과를 기준으로 Redis Hash 캐시를 만들어 조회 흐름에서 재사용합니다.
   */
  async createProduct(input: CreateProductInput): Promise<ProductStockOutput> {
    // 잘못된 재고가 DB에 저장되기 전에 서비스 경계에서 차단합니다.
    this.validateStock(input.stock, 'stock');

    const product = await prisma.product.create({
      data: {
        name: input.name,
        stock: input.stock,
        status: input.status ?? 'ON_SALE',
      },
      select: ProductStockSelect,
    });

    const output = toProductStockOutput(product);

    // DB 생성 결과를 기준으로 Redis Hash를 저장합니다.
    await this.saveProductStockToHash(output);

    return output;
  }

  /**
   * DB에서 상품 재고 상태 조회
   *
   * 1. productId로 Product 테이블에서 상품 1개를 조회합니다.
   * 2. ProductStockSelect로 Redis Hash에 필요한 필드만 가져옵니다.
   * 3. Prisma 결과를 ProductStockOutput 형태로 변환합니다.
   *
   * findUniqueOrThrow는 상품이 없으면 null을 반환하지 않고 Prisma 예외(P2025)를 던집니다.
   */
  async getProductStockFromDatabase(productId: number): Promise<ProductStockOutput> {
    const product = await prisma.product.findUniqueOrThrow({
      where: {
        id: productId,
      },
      select: ProductStockSelect,
    });

    return toProductStockOutput(product);
  }

  /**
   * 상품 재고 상태를 Redis Hash에 저장
   *
   * 1. productId로 Redis Hash key를 만듭니다.
   * 2. ProductStockOutput 필드를 Redis Hash 필드로 저장합니다.
   * 3. TTL을 설정해 오래된 캐시가 무기한 남지 않게 합니다.
   *
   * 실습 포인트:
   * Redis Hash는 stock/reservedStock/availableStock처럼 관련 있는 값을 필드별로 저장할 수 있습니다.
   */
  async saveProductStockToHash(product: ProductStockOutput, ttlSeconds = 300): Promise<void> {
    // 0 이하의 TTL은 캐시를 즉시 삭제하므로 저장 전에 차단합니다.
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('ttlSeconds must be a positive integer');
    }

    // 상품 재고 Hash key입니다.
    // 예: hash:product-stock:1
    const key = RedisKey.hash.productStock(product.productId);

    // 상품 재고 캐시의 필드 값을 저장하거나 갱신합니다.
    // 여러 필드를 함께 저장하고 새로 추가된 필드 수를 반환하며, 기존 필드는 값을 덮어씁니다.
    await redis.hSet(key, {
      productId: String(product.productId),
      name: product.name,
      stock: String(product.stock),
      reservedStock: String(product.reservedStock),
      availableStock: String(product.availableStock),
      status: product.status,
      updatedAt: product.updatedAt,
    });

    // 상품 재고 캐시이 일정 시간이 지나면 자동으로 정리되도록 설정합니다.
    // 만료 시간을 설정하면 1을, 상품 재고 캐시가 없으면 0을 반환합니다.
    await redis.expire(key, ttlSeconds);
  }

  /**
   * Redis Hash에서 상품 재고 상태 조회
   *
   * 1. productId로 Redis Hash key를 만듭니다.
   * 2. hGetAll로 상품 재고 Hash 전체 필드를 조회합니다.
   * 3. Redis 조회 결과를 ProductStockOutput 형태로 변환합니다.
   */
  async getProductStockFromHash(productId: number): Promise<ProductStockOutput | null> {
    const key = RedisKey.hash.productStock(productId);
    // 상품 재고 캐시의 모든 필드를 조회합니다.
    // 전체 필드와 값을 반환하며, 저장된 데이터가 없으면 빈 객체를 반환합니다.
    const hash = await redis.hGetAll(key);

    return parseProductStockHash(hash);
  }

  /**
   * 상품 재고 상태 조회
   *
   * 1. Redis Hash에서 상품 재고 상태를 먼저 조회합니다.
   * 2. 캐시에 값이 있으면 DB를 조회하지 않고 바로 반환합니다.
   * 3. 캐시에 값이 없으면 DB에서 조회합니다.
   * 4. DB 조회 결과를 Redis Hash에 저장합니다.
   *
   * 실습 포인트:
   * 자주 조회되는 재고 상태를 Redis에 저장하면 DB 조회 횟수를 줄일 수 있습니다.
   */
  async getProductStock(productId: number): Promise<ProductStockOutput> {
    // Cache hit: Redis Hash에 데이터가 있으면 DB를 조회하지 않고 바로 반환합니다.
    const cachedStock = await this.getProductStockFromHash(productId);

    if (cachedStock) {
      return cachedStock;
    }

    // Cache miss: Redis Hash에 없을 때만 DB를 조회합니다.
    const dbStock = await this.getProductStockFromDatabase(productId);

    // DB 조회 결과를 다음 요청에서 재사용할 수 있도록 Hash에 저장합니다.
    await this.saveProductStockToHash(dbStock);

    return dbStock;
  }

  /**
   * 예약 재고 증가
   *
   * 1. 현재 상품 재고 상태를 조회합니다.
   * 2. reservedStock을 전달받은 수량만큼 증가시킵니다.
   * 3. availableStock을 stock - reservedStock으로 다시 계산합니다.
   * 4. 변경된 재고 상태를 Redis Hash에 저장합니다.
   *
   * 실습 포인트:
   * 실제 주문 확정 전 임시 예약 수량을 Redis Hash에서 관리합니다.
   * 이 메서드는 DB 재고를 직접 바꾸지 않고 Redis Hash의 예약 상태만 갱신합니다.
   *
   * 참고:
   * 실무에서는 초과 예약 검증과 동시성 제어가 필요하지만, 여기서는 Redis Hash 흐름을 이해하기 위해 단순하게 구성합니다.
   */
  async increaseReservedStock(productId: number, quantity: number): Promise<ProductStockOutput> {
    this.validateQuantity(quantity);

    const current = await this.getProductStock(productId);

    const nextReservedStock = current.reservedStock + quantity;
    const nextAvailableStock = current.stock - nextReservedStock;

    const updated: ProductStockOutput = {
      ...current,
      reservedStock: nextReservedStock,
      availableStock: nextAvailableStock,
      updatedAt: new Date().toISOString(),
    };

    // 예약 재고는 Redis Hash에만 반영합니다.
    await this.saveProductStockToHash(updated);

    return updated;
  }

  /**
   * 예약 재고 감소
   *
   * 1. 현재 상품 재고 상태를 조회합니다.
   * 2. reservedStock을 전달받은 수량만큼 감소시킵니다.
   * 3. reservedStock이 0보다 작아지지 않도록 보정합니다.
   * 4. availableStock을 stock - reservedStock으로 다시 계산합니다.
   * 5. 변경된 재고 상태를 Redis Hash에 저장합니다.
   *
   * 실습 포인트:
   * 주문 취소나 예약 만료 상황을 가정해 Redis Hash에 저장된 예약 수량을 줄입니다.
   */
  async decreaseReservedStock(productId: number, quantity: number): Promise<ProductStockOutput> {
    this.validateQuantity(quantity);

    const current = await this.getProductStock(productId);

    const nextReservedStock = Math.max(current.reservedStock - quantity, 0);
    const nextAvailableStock = current.stock - nextReservedStock;

    const updated: ProductStockOutput = {
      ...current,
      reservedStock: nextReservedStock,
      availableStock: nextAvailableStock,
      updatedAt: new Date().toISOString(),
    };

    // 예약 취소 결과를 Redis Hash에 반영합니다.
    await this.saveProductStockToHash(updated);

    return updated;
  }

  /**
   * DB 상품 재고 수정 후 Redis Hash 동기화
   *
   * 1. productId에 해당하는 상품의 stock/status를 수정합니다.
   * 2. undefined가 아닌 필드만 update data에 포함합니다.
   * 3. reservedStock 입력값이 없으면 기존 Redis 예약 수량을 유지합니다.
   * 4. DB 결과와 예약 수량을 ProductStockOutput 형태로 조합합니다.
   * 5. Redis Hash를 최신 데이터로 다시 저장합니다.
   *
   * 실습 포인트:
   * stock/status는 DB를 기준으로 관리하고, reservedStock은 Redis Hash에서 함께 표현합니다.
   *
   * 실무에서는 DB 갱신 후 Redis Hash를 삭제하는 방식도 자주 사용합니다.
   * 캐시를 직접 갱신하는 것보다 단순하고, 다음 조회 때 DB 기준 최신 값을 다시 캐싱하므로 더 안전합니다.
   */
  async updateProductStock(
    productId: number,
    input: UpdateProductStockInput,
  ): Promise<ProductStockOutput> {
    if (input.stock !== undefined) {
      this.validateStock(input.stock, 'stock');
    }

    if (input.reservedStock !== undefined) {
      this.validateStock(input.reservedStock, 'reservedStock');
    }

    // reservedStock은 DB 컬럼이 아니므로 DB 수정 전에 현재 Hash 값을 보관합니다.
    // 캐시가 없으면 예약된 수량이 없는 것으로 간주합니다.
    const cachedStock = await this.getProductStockFromHash(productId);

    // prisma.product.update()는 대상 상품이 없으면 null을 반환하지 않고
    // P2025 예외를 던집니다.
    const product = await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        // 값이 undefined인 필드는 업데이트하지 않습니다.
        // 예: stock만 들어오면 status는 기존 값을 유지합니다.
        ...(input.stock !== undefined && { stock: input.stock }),
        ...(input.status !== undefined && { status: input.status }),
      },
      select: ProductStockSelect,
    });

    // 새 예약 수량이 없으면 기존 Hash의 값을 유지합니다.
    const reservedStock = input.reservedStock ?? cachedStock?.reservedStock ?? 0;
    const output = toProductStockOutput(product, reservedStock);

    // DB 업데이트 후 Redis Hash도 같은 값으로 갱신합니다.
    await this.saveProductStockToHash(output);

    return output;
  }

  /**
   * 상품 재고 Hash 삭제
   *
   * 1. productId로 Redis Hash key를 만듭니다.
   * 2. 해당 상품 재고 Hash key를 Redis에서 삭제합니다.
   *
   * 실습 포인트:
   * 캐시를 지우면 다음 조회 시 DB에서 최신 상품 재고를 읽고 다시 캐싱합니다.
   */
  async deleteProductStockHash(productId: number): Promise<void> {
    const key = RedisKey.hash.productStock(productId);
    // 상품 재고 캐시 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
