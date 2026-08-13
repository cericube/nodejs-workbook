import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/ch04/4-2-4.header-behavior-app';
import type { FastifyInstance } from 'fastify';

// json()의 기본 any 반환에서 파생되는 규칙은 HTTP 헤더 동작에 집중하기 위해 국소 제외합니다.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('Content API - Header 기반 동작 테스트', () => {
  let app: FastifyInstance;

  /**
   * 모든 테스트 전에 Fastify 앱을 1회만 생성
   * → listen() 없이 inject()로 내부 요청 테스트
   */
  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  /**
   * 전체 테스트 종료 후 Fastify 인스턴스 정리
   */
  afterAll(async () => {
    await app.close();
  });

  /**
   * -------------------------------------------------------
   * Content Negotiation (Accept Header)
   * -------------------------------------------------------
   * 클라이언트가 원하는 응답 포맷을 Accept 헤더로 전달하면
   * 서버가 그에 맞는 representation을 반환하는지 검증
   */
  describe('Content Negotiation - Accept 헤더', () => {
    it('Accept: application/json은 JSON을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        headers: {
          accept: 'application/json',
        },
      });

      // 정상 응답
      expect(response.statusCode).toBe(200);

      // Content-Type이 JSON인지 확인
      expect(response.headers['content-type']).toContain('application/json');

      // JSON body 구조 검증
      const body = response.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('title');
    });

    it('Accept: application/xml은 XML을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        headers: {
          accept: 'application/xml',
        },
      });

      expect(response.statusCode).toBe(200);

      // XML은 정확한 content-type 매칭이 중요
      expect(response.headers['content-type']).toBe('application/xml');

      // 단순 문자열 기반 XML 구조 검증
      expect(response.body).toContain('<content>');
      expect(response.body).toContain('</content>');
    });

    it('Accept: text/plain은 텍스트를 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        headers: {
          accept: 'text/plain',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain');

      // plain text는 문자열로만 구성
      expect(typeof response.body).toBe('string');

      // JSON 형태가 아님을 간접 검증
      expect(response.body).not.toContain('{');
    });

    it('Accept 헤더가 없으면 JSON을 반환합니다 (기본값)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        // Accept 헤더 미전달 → 서버 기본 포맷 사용
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  /**
   * -------------------------------------------------------
   * HTTP Cache Validation - ETag / If-None-Match
   * -------------------------------------------------------
   * 동일 리소스에 대해 변경이 없으면 304로 네트워크 비용 절감
   */
  describe('조건부 요청 - ETag & If-None-Match', () => {
    it('ETag 헤더를 응답에 포함합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
      });

      // 서버가 캐시 검증용 식별자를 제공하는지 확인
      expect(response.headers.etag).toBeDefined();

      // RFC 규격상 ETag는 따옴표 포함
      expect(response.headers.etag).toMatch(/^".*"$/);
    });

    it('If-None-Match가 ETag와 일치하면 304를 반환합니다', async () => {
      // 1차 요청 → ETag 확보
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/api/content/1',
      });

      const etag = firstResponse.headers.etag;

      // 2차 요청 → 동일 ETag 전송
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        headers: {
          'if-none-match': etag!,
        },
      });

      // 변경 없으므로 Not Modified
      expect(secondResponse.statusCode).toBe(304);

      // 304 응답은 body를 포함하지 않음
      expect(secondResponse.body).toBe('');
    });

    it('If-None-Match가 ETag와 다르면 200을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        headers: {
          'if-none-match': '"different-etag"',
        },
      });

      // 캐시 무효 → 전체 응답 반환
      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('id');
    });
  });

  /**
   * -------------------------------------------------------
   * HTTP Cache Validation - Last-Modified / If-Modified-Since
   * -------------------------------------------------------
   * 날짜 기반 캐시 검증 (ETag가 없거나 보조 수단으로 사용)
   */
  describe('조건부 요청 - Last-Modified & If-Modified-Since', () => {
    it('Last-Modified 헤더를 응답에 포함합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
      });

      expect(response.headers['last-modified']).toBeDefined();

      // 날짜 파싱 가능 여부 확인
      const lastModified = new Date(response.headers['last-modified']!);
      expect(lastModified.toString()).not.toBe('Invalid Date');
    });

    it('If-Modified-Since 이후 수정되지 않았으면 304를 반환합니다', async () => {
      // 미래 시점 → 당연히 수정되지 않음
      const futureDate = new Date('2025-01-01T00:00:00.000Z').toUTCString();

      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        headers: {
          'if-modified-since': futureDate,
        },
      });

      expect(response.statusCode).toBe(304);
    });

    it('If-Modified-Since 이후 수정되었으면 200을 반환합니다', async () => {
      // 과거 시점 → 이후에 수정됨
      const pastDate = new Date('2020-01-01T00:00:00.000Z').toUTCString();

      const response = await app.inject({
        method: 'GET',
        url: '/api/content/1',
        headers: {
          'if-modified-since': pastDate,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  /**
   * -------------------------------------------------------
   * API Versioning - Custom Header
   * -------------------------------------------------------
   * URL 분리 없이 Header 기반으로 API 구조 변경
   */
  describe('API 버전 관리 - API-Version 헤더', () => {
    it('API-Version: 1은 v1 응답을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/data',
        headers: {
          'api-version': '1',
        },
      });

      const body = response.json();

      // v1 구조 검증
      expect(body.version).toBe(1);
      expect(body).toHaveProperty('items');
      expect(body).not.toHaveProperty('metadata');
    });

    it('API-Version: 2는 v2 응답을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/data',
        headers: {
          'api-version': '2',
        },
      });

      const body = response.json();

      // v2는 구조가 달라짐
      expect(body.version).toBe(2);
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('metadata');
    });

    it('API-Version이 없으면 기본값 v1을 사용합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/data',
      });

      const body = response.json();
      expect(body.version).toBe(1);
    });
  });

  /**
   * -------------------------------------------------------
   * Feature Toggle - Custom Header
   * -------------------------------------------------------
   * A/B 테스트, 내부 기능 노출 등에 활용되는 패턴
   */
  describe('커스텀 헤더 기반 기능 토글', () => {
    it('X-Include-Experimental: true는 실험적 기능을 포함합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/features',
        headers: {
          'x-include-experimental': 'true',
        },
      });

      const body = response.json();
      expect(body).toHaveProperty('experimental');
      expect(body.experimental).toEqual(['exp1', 'exp2']);
    });

    it('X-Verbose: true는 상세 정보를 포함합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/features',
        headers: {
          'x-verbose': 'true',
        },
      });

      const body = response.json();
      expect(body).toHaveProperty('details');
      expect(body.details).toHaveProperty('description');
    });

    it('여러 커스텀 헤더를 동시에 사용할 수 있습니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/features',
        headers: {
          'x-include-experimental': 'true',
          'x-verbose': 'true',
        },
      });

      const body = response.json();
      expect(body).toHaveProperty('basic');
      expect(body).toHaveProperty('experimental');
      expect(body).toHaveProperty('details');
    });

    it('커스텀 헤더가 없으면 기본 응답만 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/features',
      });

      const body = response.json();
      expect(body).toHaveProperty('basic');
      expect(body).not.toHaveProperty('experimental');
      expect(body).not.toHaveProperty('details');
    });
  });

  /**
   * -------------------------------------------------------
   * Authorization Header - 인증 / 인가 흐름 테스트
   * -------------------------------------------------------
   */
  describe('Authorization 헤더', () => {
    it('Authorization 헤더가 없으면 401을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
      });

      expect(response.statusCode).toBe(401);

      const body = response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('Bearer 형식이 아니면 401을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Basic abc123',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('유효하지 않은 토큰은 403을 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(403);

      const body = response.json();
      expect(body.error).toBe('Forbidden');
    });

    it('유효한 토큰은 200과 사용자 정보를 반환합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);

      // 인증 성공 후 서버가 사용자 메타정보를 헤더에 포함하는 경우
      expect(response.headers['x-user-role']).toBeDefined();

      const body = response.json();
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('role');
    });
  });

  /**
   * -------------------------------------------------------
   * Header Name Case Insensitive
   * -------------------------------------------------------
   * HTTP 스펙상 헤더 이름은 대소문자를 구분하지 않음
   */
  describe('대소문자 구분 없는 헤더 처리', () => {
    it('헤더명은 대소문자를 구분하지 않습니다', async () => {
      const responses = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/protected',
          headers: { authorization: 'Bearer valid-token' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/protected',
          headers: { Authorization: 'Bearer valid-token' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/protected',
          headers: { AUTHORIZATION: 'Bearer valid-token' },
        }),
      ]);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });
  });
});
