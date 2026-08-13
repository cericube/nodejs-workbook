import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../../src/ch04/4-2-3.json-body-app';
import type { FastifyInstance } from 'fastify';

// Fastify inject 응답은 런타임 JSON이므로 이 예제에서는 상태 코드와 필드 assertion으로
// 계약을 검증합니다. json()의 기본 any 반환에서 파생되는 규칙만 국소적으로 제외합니다.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

describe('Articles API - JSON Body 테스트', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/articles - 생성', () => {
    it('올바른 데이터로 게시글을 생성합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '테스트 게시글',
          content: '테스트 내용입니다.',
          author: 'John Doe',
          tags: ['test', 'example'],
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.title).toBe('테스트 게시글');
      expect(body.content).toBe('테스트 내용입니다.');
      expect(body.author).toBe('John Doe');
      expect(body.tags).toEqual(['test', 'example']);
      expect(body.updatedAt).toBeDefined();
    });

    it('tags를 생략하면 빈 배열로 초기화됩니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '태그 없는 게시글',
          content: '내용',
          author: 'Jane Doe',
        },
      });

      const body = response.json();
      expect(body.tags).toEqual([]);
    });

    it('publishedAt을 지정할 수 있습니다', async () => {
      const publishedAt = '2024-01-15T00:00:00.000Z';

      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '발행일 지정',
          content: '내용',
          author: 'Bob',
          publishedAt,
        },
      });

      const body = response.json();
      expect(body.publishedAt).toBe(publishedAt);
    });

    it('필수 필드가 누락되면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '제목만 있음',
          // content와 author 누락
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.message).toContain('body');
    });

    it('title이 빈 문자열이면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '',
          content: '내용',
          author: 'Author',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('title이 너무 길면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: 'a'.repeat(201), // 200자 초과
          content: '내용',
          author: 'Author',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('tags 배열이 너무 많으면 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '제목',
          content: '내용',
          author: 'Author',
          tags: Array(11).fill('tag'), // 10개 초과
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('잘못된 JSON 형식은 400을 반환합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        headers: {
          'content-type': 'application/json',
        },
        payload: 'invalid json{', // 잘못된 JSON
      });

      expect(response.statusCode).toBe(400);
    });

    it('추가 필드가 있어도 무시됩니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '제목',
          content: '내용',
          author: 'Author',
          unexpectedField: 'should be ignored',
          anotherField: 123,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body).not.toHaveProperty('unexpectedField');
      expect(body).not.toHaveProperty('anotherField');
    });
  });

  describe('PUT /api/articles/:id - 전체 업데이트', () => {
    let articleId: string;

    beforeEach(async () => {
      // 각 테스트가 수정할 전용 게시글을 만들어 테스트 간 상태 의존성을 줄입니다.
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '원본 제목',
          content: '원본 내용',
          author: 'Original Author',
          tags: ['original'],
        },
      });

      articleId = createResponse.json().id;
    });

    it('게시글을 업데이트합니다', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/articles/${articleId}`,
        payload: {
          title: '수정된 제목',
          content: '수정된 내용',
          tags: ['updated', 'modified'],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.title).toBe('수정된 제목');
      expect(body.content).toBe('수정된 내용');
      expect(body.tags).toEqual(['updated', 'modified']);
      expect(body.author).toBe('Original Author'); // author는 변경되지 않음
    });

    it('일부 필드만 업데이트할 수 있습니다', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/articles/${articleId}`,
        payload: {
          title: '제목만 변경',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.title).toBe('제목만 변경');
      expect(body.content).toBe('원본 내용'); // 변경되지 않음
    });

    it('updatedAt이 자동으로 갱신됩니다', async () => {
      const beforeUpdate = new Date();

      // 실제 시간 대기는 느리고 불안정할 수 있습니다. 여기서는 학습용 인메모리 예제로만 사용합니다.
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response = await app.inject({
        method: 'PUT',
        url: `/api/articles/${articleId}`,
        payload: {
          title: '시간 테스트',
        },
      });

      const body = response.json();
      const updatedAt = new Date(body.updatedAt);

      expect(updatedAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });

    it('존재하지 않는 ID는 404를 반환합니다', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/articles/999',
        payload: {
          title: '업데이트 시도',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('빈 객체로 업데이트해도 에러가 발생하지 않습니다', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/articles/${articleId}`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      // 아무것도 변경되지 않지만 updatedAt은 갱신됨
    });
  });

  describe('PATCH /api/articles/:id/publish - 부분 업데이트', () => {
    let articleId: string;

    beforeEach(async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/articles',
        payload: {
          title: '미발행 게시글',
          content: '내용',
          author: 'Author',
        },
      });

      articleId = createResponse.json().id;
    });

    it('게시글을 발행합니다', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/articles/${articleId}/publish`,
        payload: {
          publishedAt: '2024-01-15T12:00:00.000Z',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.publishedAt).toBe('2024-01-15T12:00:00.000Z');
    });

    it('publishedAt을 null로 설정하여 미발행 상태로 되돌립니다', async () => {
      // 먼저 발행
      await app.inject({
        method: 'PATCH',
        url: `/api/articles/${articleId}/publish`,
        payload: {
          publishedAt: '2024-01-15T12:00:00.000Z',
        },
      });

      // 미발행으로 되돌리기
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/articles/${articleId}/publish`,
        payload: {
          publishedAt: null,
        },
      });

      const body = response.json();
      expect(body.publishedAt).toBeNull();
    });

    it('publishedAt을 생략하면 현재 시각으로 설정됩니다', async () => {
      const beforePublish = new Date();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/articles/${articleId}/publish`,
        payload: {},
      });

      const body = response.json();
      const publishedAt = new Date(body.publishedAt);

      expect(publishedAt.getTime()).toBeGreaterThanOrEqual(beforePublish.getTime());
    });
  });

  describe('Content-Type 헤더 테스트', () => {
    it('Content-Type이 application/json이어야 합니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          title: '제목',
          content: '내용',
          author: 'Author',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('Content-Type이 없으면 자동으로 처리됩니다', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/articles',
        // Content-Type 헤더 생략
        payload: {
          title: '제목',
          content: '내용',
          author: 'Author',
        },
      });

      // inject()는 자동으로 JSON을 처리
      expect(response.statusCode).toBe(201);
    });
  });
});
