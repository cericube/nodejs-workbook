import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/ch04/4-2-2.query-and-path-params-app';
import type { FastifyInstance } from 'fastify';

// LightMyRequest의 json() 기본 반환형은 any입니다. API 계약 자체를 배우는 예제이므로
// 각 assertion에서 응답 모양을 검증하고, 관련 unsafe 규칙은 이 파일에 한해 제외합니다.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

describe('Products API - Query & Path Parameter 테스트', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Query Parameter 테스트', () => {
    it('파라미터 없이 전체 상품을 조회합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products',
      });

      expect(response.statusCode).toBe(200); // 정상적으로 요청이 성공했는지 확인

      const body = response.json();
      expect(body.data).toBeDefined(); // data 필드가 존재하는지 확인
      expect(Array.isArray(body.data)).toBe(true); // data가 배열 형태인지 확인
      expect(body.pagination).toBeDefined(); // pagination 정보가 포함되어 있는지 확인
    });

    it('category 파라미터로 필터링합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?category=electronics',
      });

      const body = response.json();

      // 모든 상품이 electronics 카테고리인지 확인
      expect(body.data.every((p: any) => p.category === 'electronics')).toBe(true);
      // 필터링 결과가 최소 1개 이상인지 확인
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('minPrice와 maxPrice로 가격 범위를 필터링합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?minPrice=50&maxPrice=200',
      });

      const body = response.json();

      // 모든 상품의 가격이 지정된 범위 내인지 확인
      expect(body.data.every((p: any) => p.price >= 50 && p.price <= 200)).toBe(true);
    });

    it('inStock 파라미터로 재고 상태를 필터링합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?inStock=true',
      });

      const body = response.json();
      // 모든 상품이 재고 있음 상태인지 확인
      expect(body.data.every((p: any) => p.inStock === true)).toBe(true);
    });

    it('여러 필터를 조합하여 사용합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?category=electronics&inStock=true&maxPrice=100',
      });

      const body = response.json();

      // 모든 상품이 카테고리, 재고, 가격 조건을 동시에 만족하는지 확인
      expect(
        body.data.every(
          (p: any) => p.category === 'electronics' && p.inStock === true && p.price <= 100,
        ),
      ).toBe(true);
    });

    it('page와 limit으로 페이지네이션을 처리합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?page=1&limit=2',
      });

      const body = response.json();

      expect(body.data.length).toBeLessThanOrEqual(2); // 한 페이지에 최대 limit 개수만 반환되는지 확인
      expect(body.pagination.page).toBe(1); // 현재 페이지 번호가 요청값과 일치하는지 확인
      expect(body.pagination.limit).toBe(2); // 페이지 크기가 요청값과 일치하는지 확인
      expect(body.pagination.total).toBeGreaterThan(0); // 전체 데이터 개수가 0보다 큰지 확인
    });

    it('sort와 order로 정렬합니다', async () => {
      const ascResponse = await app.inject({
        method: 'GET',
        url: '/api/products?sort=price&order=asc',
      });

      const ascBody = ascResponse.json();
      const ascPrices = ascBody.data.map((p: any) => p.price);

      // 가격이 오름차순으로 정렬되어 있는지 확인
      for (let i = 0; i < ascPrices.length - 1; i++) {
        expect(ascPrices[i]).toBeLessThanOrEqual(ascPrices[i + 1]);
      }

      const descResponse = await app.inject({
        method: 'GET',
        url: '/api/products?sort=price&order=desc',
      });

      const descBody = descResponse.json();
      const descPrices = descBody.data.map((p: any) => p.price);

      // 가격이 내림차순으로 정렬되어 있는지 확인
      for (let i = 0; i < descPrices.length - 1; i++) {
        expect(descPrices[i]).toBeGreaterThanOrEqual(descPrices[i + 1]);
      }
    });

    it('잘못된 query parameter 형식을 처리합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?page=invalid&limit=abc',
      });

      // JSON Schema의 number 변환에 실패하므로 handler 실행 전에 400이 반환됩니다.
      expect(response.statusCode).toBe(400);
    });

    it('특수 문자가 포함된 query parameter를 처리합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?category=home%20%26%20garden',
      });

      // URL 인코딩된 파라미터가 올바르게 디코딩되는지 확인
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Path Parameter 테스트', () => {
    it('유효한 ID로 상품을 조회합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products/1',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.id).toBe('1');
    });

    it('존재하지 않는 ID는 404를 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products/999',
      });

      expect(response.statusCode).toBe(404);

      const body = response.json();
      expect(body.error).toBe('NotFound');
    });

    it('특수 문자가 포함된 ID를 처리합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products/test%2Fid',
      });

      // 디코딩된 값과 일치하는 상품이 없으므로 명시적으로 404를 기대합니다.
      expect(response.statusCode).toBe(404);
    });
  });

  describe('중첩된 Path Parameter 테스트', () => {
    it('카테고리와 ID를 모두 사용하여 조회합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/categories/electronics/products/1',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.id).toBe('1');
      expect(body.category).toBe('electronics');
    });

    it('카테고리가 일치하지 않으면 404를 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/categories/furniture/products/1',
      });

      // ID 1은 electronics 카테고리이므로 404
      expect(response.statusCode).toBe(404);
    });

    it('둘 다 존재하지 않으면 404를 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/categories/nonexistent/products/999',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Query와 Path Parameter 조합', () => {
    it('Path로 리소스를 식별하고 Query로 필터링합니다', async () => {
      // 실제 API 예시: /api/categories/:category/products?inStock=true
      const response = await app.inject({
        method: 'GET',
        url: '/api/products?category=electronics&inStock=true',
      });

      const body = response.json();

      expect(body.data.every((p: any) => p.category === 'electronics' && p.inStock === true)).toBe(
        true,
      );
    });
  });
});
