import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

/**
 * ============================================================
 * Example Dataset (In-Memory)
 * ============================================================
 * DB 없이 Query / Params 동작을 설명하기 위한 샘플 데이터
 */
const products: Product[] = [
  { id: '1', name: 'Laptop', price: 1200, category: 'electronics', inStock: true },
  { id: '2', name: 'Mouse', price: 25, category: 'electronics', inStock: true },
  { id: '3', name: 'Desk', price: 300, category: 'furniture', inStock: false },
  { id: '4', name: 'Chair', price: 150, category: 'furniture', inStock: true },
];

/**
 * ============================================================
 * Fastify Route Plugin
 * ============================================================
 * - app.register(productRoutes) 형태로 등록
 * - 도메인 단위 라우트 모듈 분리 패턴
 */
export function productRoutes(app: FastifyInstance) {
  /**
   * ============================================================
   * GET /api/products
   * ============================================================
   * Query 기반:
   *  - 필터링: category, price range, inStock
   *  - 정렬: sort, order
   *  - 페이지네이션: page, limit
   *
   * Validation 전략:
   *  - 숫자 필드는 type: number 로 정의 → Fastify가 자동 변환
   *  - enum 값은 schema enum 으로 제한
   *  - 잘못된 입력은 handler 진입 전 400 응답
   */

  const listProductsSchema = {
    querystring: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        minPrice: { type: 'number', minimum: 0 },
        maxPrice: { type: 'number', minimum: 0 },
        inStock: { type: 'boolean' },
        page: { type: 'number', minimum: 1, default: 1 },
        limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
        sort: { type: 'string', enum: ['price', 'name'], default: 'name' },
        order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
      },
      additionalProperties: false,
    },
  };

  app.get<{
    Querystring: {
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      inStock?: boolean;
      page: number;
      limit: number;
      sort: 'price' | 'name';
      order: 'asc' | 'desc';
    };
  }>('/api/products', { schema: listProductsSchema }, (request) => {
    const { category, minPrice, maxPrice, inStock, page, limit, sort, order } = request.query;

    // 원본 보호를 위한 복사
    let filtered = [...products];

    /** -------------------------------
     * Filtering
     * ------------------------------ */
    if (category) {
      filtered = filtered.filter((p) => p.category === category);
    }

    if (minPrice !== undefined) {
      filtered = filtered.filter((p) => p.price >= minPrice);
    }

    if (maxPrice !== undefined) {
      filtered = filtered.filter((p) => p.price <= maxPrice);
    }

    if (inStock !== undefined) {
      filtered = filtered.filter((p) => p.inStock === inStock);
    }

    /** -------------------------------
     * Sorting
     * ------------------------------ */
    filtered.sort((a, b) => {
      const aValue = a[sort];
      const bValue = b[sort];
      const cmp = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return order === 'asc' ? cmp : -cmp;
    });

    /** -------------------------------
     * Pagination
     * ------------------------------ */
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginated = filtered.slice(startIndex, endIndex);

    return {
      data: paginated,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
    };
  });

  /**
   * ============================================================
   * GET /api/products/:id
   * ============================================================
   * Path Parameter 기반 단일 리소스 조회
   */

  const getProductByIdSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  };

  app.get<{
    Params: { id: string };
  }>('/api/products/:id', { schema: getProductByIdSchema }, (request, reply) => {
    const { id } = request.params;

    const product = products.find((p) => p.id === id);

    if (!product) {
      return reply.code(404).send({
        error: 'NotFound',
        message: '상품을 찾을 수 없습니다',
      });
    }

    return product;
  });

  /**
   * ============================================================
   * GET /api/categories/:category/products/:id
   * ============================================================
   * 중첩 Path Parameter 예시
   * - RESTful 계층 구조 표현
   * - 부모 리소스 조건까지 함께 검증
   */

  const getProductByCategoryAndIdSchema = {
    params: {
      type: 'object',
      required: ['category', 'id'],
      properties: {
        category: { type: 'string', minLength: 1 },
        id: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  };

  app.get<{
    Params: { category: string; id: string };
  }>(
    '/api/categories/:category/products/:id',
    { schema: getProductByCategoryAndIdSchema },
    (request, reply) => {
      const { category, id } = request.params;

      const product = products.find((p) => p.id === id && p.category === category);

      if (!product) {
        return reply.code(404).send({
          error: 'NotFound',
          message: '해당 카테고리에서 상품을 찾을 수 없습니다',
        });
      }

      return product;
    },
  );
}

/**
 * ============================================================
 * Fastify App Factory
 * ============================================================
 * 목적:
 *  1. Vitest inject() 테스트와 server.ts 에서 동일한 앱 사용
 *  2. 테스트/운영 환경 간 구성 차이 최소화
 *
 * 패턴:
 *  - listen() 하지 않은 순수 Fastify 인스턴스 반환
 *  - 테스트에서 app.inject()로 직접 요청 수행
 */
export function buildApp() {
  const app = Fastify({
    logger: false,
  });

  app.register(productRoutes);

  return app;
}
