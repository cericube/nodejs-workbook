import { describe, expect, it } from 'vitest';

import { ProductHashService } from '../../src/ch06/product-hash.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { prisma } from '../../src/shared/prisma.js';
import { redis } from '../../src/shared/redis.js';

describe('ProductHashService', () => {
  const service = new ProductHashService();

  it('상품을 DB에 생성하고 재고 상태를 Redis Hash에 저장한다', async () => {
    const product = await service.createProduct({ name: '키보드', stock: 10 });
    const key = RedisKey.hash.productStock(product.productId);

    expect(product).toMatchObject({
      name: '키보드',
      stock: 10,
      reservedStock: 0,
      availableStock: 10,
      status: 'ON_SALE',
    });
    await expect(service.getProductStockFromHash(product.productId)).resolves.toEqual(product);
    expect(await redis.ttl(key)).toBeGreaterThan(0);
  });

  it('음수이거나 소수인 재고 값은 DB를 변경하기 전에 거부한다', async () => {
    await expect(service.createProduct({ name: '잘못된 상품', stock: -1 })).rejects.toThrow(
      'stock must be a non-negative integer',
    );

    const product = await service.createProduct({ name: '정상 상품', stock: 10 });
    await expect(
      service.updateProductStock(product.productId, { reservedStock: 1.5 }),
    ).rejects.toThrow('reservedStock must be a non-negative integer');

    // 검증 실패 이후에도 DB의 원본 재고는 유지되어야 합니다.
    await expect(service.getProductStockFromDatabase(product.productId)).resolves.toMatchObject({
      stock: 10,
    });
  });

  it('캐시가 있으면 DB보다 Redis Hash의 값을 우선 반환한다', async () => {
    const product = await service.createProduct({ name: '모니터', stock: 8 });

    await prisma.product.update({
      where: { id: product.productId },
      data: { stock: 99 },
    });

    await expect(service.getProductStock(product.productId)).resolves.toEqual(product);
  });

  it('예약 재고를 증감하고 가용 재고를 다시 계산한다', async () => {
    const product = await service.createProduct({ name: '마우스', stock: 10 });

    const increased = await service.increaseReservedStock(product.productId, 4);
    expect(increased).toMatchObject({ reservedStock: 4, availableStock: 6 });

    const decreased = await service.decreaseReservedStock(product.productId, 10);
    expect(decreased).toMatchObject({ reservedStock: 0, availableStock: 10 });
  });

  it('0 이하이거나 정수가 아닌 예약 수량을 거부한다', async () => {
    const product = await service.createProduct({ name: '충전기', stock: 10 });

    await expect(service.increaseReservedStock(product.productId, 0)).rejects.toThrow(
      'quantity must be a positive integer',
    );
    await expect(service.decreaseReservedStock(product.productId, -1)).rejects.toThrow(
      'quantity must be a positive integer',
    );
    await expect(service.increaseReservedStock(product.productId, 1.5)).rejects.toThrow(
      'quantity must be a positive integer',
    );
  });

  it('DB 재고를 수정하고 예약 재고와 함께 Hash를 동기화한다', async () => {
    const product = await service.createProduct({ name: '헤드셋', stock: 5 });

    const updated = await service.updateProductStock(product.productId, {
      stock: 20,
      reservedStock: 3,
      status: 'SOLD_OUT',
    });

    expect(updated).toMatchObject({
      stock: 20,
      reservedStock: 3,
      availableStock: 17,
      status: 'SOLD_OUT',
    });
    await expect(service.getProductStockFromDatabase(product.productId)).resolves.toMatchObject({
      stock: 20,
      reservedStock: 0,
      status: 'SOLD_OUT',
    });
    await expect(service.getProductStockFromHash(product.productId)).resolves.toEqual(updated);
  });

  it('예약 재고 입력을 생략하면 기존 Hash의 예약 수량을 유지한다', async () => {
    const product = await service.createProduct({ name: '웹캠', stock: 10 });
    await service.increaseReservedStock(product.productId, 4);

    const updated = await service.updateProductStock(product.productId, {
      stock: 12,
      status: 'ON_SALE',
    });

    expect(updated).toMatchObject({
      stock: 12,
      reservedStock: 4,
      availableStock: 8,
    });
  });

  it('불완전한 상품 Hash는 캐시 미스로 처리하고 DB 값으로 복구한다', async () => {
    const product = await service.createProduct({ name: 'USB 허브', stock: 7 });
    const key = RedisKey.hash.productStock(product.productId);
    await redis.del(key);
    await redis.hSet(key, { productId: String(product.productId), stock: 'invalid' });

    await expect(service.getProductStockFromHash(product.productId)).resolves.toBeNull();
    await expect(service.getProductStock(product.productId)).resolves.toMatchObject({
      name: 'USB 허브',
      stock: 7,
    });
    expect(await redis.hGet(key, 'name')).toBe('USB 허브');
  });

  it('가용 재고 계산이 맞지 않는 Hash도 손상된 캐시로 처리한다', async () => {
    const product = await service.createProduct({ name: '노트북 거치대', stock: 10 });
    const key = RedisKey.hash.productStock(product.productId);
    await redis.hSet(key, { reservedStock: '3', availableStock: '10' });

    await expect(service.getProductStockFromHash(product.productId)).resolves.toBeNull();
  });

  it('상품 재고 Hash를 삭제한다', async () => {
    const product = await service.createProduct({ name: '스피커', stock: 3 });

    await service.deleteProductStockHash(product.productId);

    await expect(service.getProductStockFromHash(product.productId)).resolves.toBeNull();
  });
});
