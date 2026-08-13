import type { FastifyInstance } from 'fastify';

/**
 * 콘텐츠 단건 조회용 데이터 모델
 * - etag, lastModified 는 HTTP 캐시/조건부 요청을 위한 메타데이터
 */
interface ContentData {
  id: string;
  title: string;
  body: string;
  version: number;
  etag: string; // ETag 헤더에 그대로 사용
  lastModified: string; // Last-Modified 헤더에 그대로 사용 (ISO 문자열)
}

/**
 * 실제 서비스에서는 DB가 되겠지만,
 * 예제에서는 메모리 Map 으로 콘텐츠 저장
 */
const contents: Map<string, ContentData> = new Map([
  [
    '1',
    {
      id: '1',
      title: 'Sample Content',
      body: 'This is the content body',
      version: 1,
      etag: '"v1-abc123"', // RFC상 ETag는 따옴표 포함 권장
      lastModified: '2024-01-01T00:00:00.000Z',
    },
  ],
]);

export function contentRoutes(app: FastifyInstance) {
  /**
   * -------------------------------------------------------
   * 1. Content Negotiation + Conditional Request 예제
   * -------------------------------------------------------
   * - Accept: 응답 포맷 결정 (JSON / XML / text)
   * - If-None-Match: ETag 기반 캐시 검증
   * - If-Modified-Since: Last-Modified 기반 캐시 검증
   */
  app.get<{ Params: { id: string } }>('/api/content/:id', (request, reply) => {
    const { id } = request.params;
    const content = contents.get(id);

    // 리소스가 없으면 404
    if (!content) {
      return reply.code(404).send({ error: 'NotFound' });
    }

    // Accept 헤더: 클라이언트가 원하는 응답 포맷
    // 없으면 관례적으로 application/json
    const accept = request.headers.accept || 'application/json';

    // 캐시 검증을 위해 항상 현재 리소스의 메타데이터 내려줌
    reply.header('ETag', content.etag);
    reply.header('Last-Modified', content.lastModified);

    /**
     * --------- 조건부 요청 처리 순서 ---------
     * RFC 권장 순서:
     * 1) If-None-Match (ETag)
     * 2) If-Modified-Since
     */

    // ETag 기반 캐시 검증
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch === content.etag) {
      // 클라이언트 캐시가 최신 → 바디 없이 304
      return reply.code(304).send();
    }

    // Last-Modified 기반 캐시 검증
    const ifModifiedSince = request.headers['if-modified-since'];
    if (ifModifiedSince) {
      const modifiedSince = new Date(ifModifiedSince);
      const lastModified = new Date(content.lastModified);

      // 서버 리소스가 이후에 변경되지 않았다면 304
      if (lastModified.getTime() <= modifiedSince.getTime()) {
        return reply.code(304).send();
      }
    }

    /**
     * --------- Content Negotiation ---------
     * Accept 헤더 값에 따라 응답 포맷 분기
     */

    if (accept.includes('application/xml')) {
      reply.header('Content-Type', 'application/xml');
      return `
          <content>
            <id>${content.id}</id>
            <title>${content.title}</title>
            <body>${content.body}</body>
          </content>
        `.trim();
    }

    if (accept.includes('text/plain')) {
      reply.header('Content-Type', 'text/plain');
      return `${content.title}\n\n${content.body}`;
    }

    // 기본값: JSON (Fastify가 자동으로 application/json 설정)
    return content;
  });

  /**
   * -------------------------------------------------------
   * 2. Header 기반 API 버전 관리 예제
   * -------------------------------------------------------
   * - URL을 나누지 않고 헤더로 버전 구분
   * - B2B / 내부 API에서 자주 사용되는 패턴
   */
  app.get('/api/data', (request) => {
    const apiVersion = request.headers['api-version'] || '1';

    if (apiVersion === '2') {
      // v2: 응답 구조 확장
      return {
        version: 2,
        data: {
          items: ['item1', 'item2'],
          metadata: {
            count: 2,
            timestamp: new Date().toISOString(),
          },
        },
      };
    }

    // v1: 단순 리스트 형태
    return {
      version: 1,
      items: ['item1', 'item2'],
    };
  });

  /**
   * -------------------------------------------------------
   * 3. Custom Header 기반 Feature Toggle
   * -------------------------------------------------------
   * - 실험 기능, 디버그 옵션, 내부 사용자 기능 등 제어
   * - 프론트 / QA / 내부 도구에서 매우 자주 쓰는 패턴
   */
  app.get('/api/features', (request) => {
    const includeExperimental = request.headers['x-include-experimental'] === 'true';
    const verboseMode = request.headers['x-verbose'] === 'true';

    const features: {
      basic: string[];
      experimental?: string[];
      details?: unknown;
    } = {
      basic: ['feature1', 'feature2'],
    };

    // 실험 기능 포함 여부
    if (includeExperimental) {
      features.experimental = ['exp1', 'exp2'];
    }

    // 상세 메타데이터 포함 여부
    if (verboseMode) {
      features.details = {
        description: 'Feature list with details',
        lastUpdated: new Date().toISOString(),
      };
    }

    return features;
  });

  /**
   * -------------------------------------------------------
   * 4. Authorization 헤더 기반 접근 제어
   * -------------------------------------------------------
   * - 실제 서비스에서는:
   *   - JWT 검증
   *   - Redis 세션
   *   - OAuth 토큰 introspection
   *   등을 수행
   */
  app.get('/api/protected', (request, reply) => {
    const authorization = request.headers.authorization;

    // Authorization 헤더 자체가 없는 경우
    if (!authorization) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authorization 헤더가 필요합니다',
      });
    }

    // Bearer 스킴 여부 확인
    if (!authorization.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Bearer 토큰 형식이어야 합니다',
      });
    }

    // 실제 토큰 값만 추출
    const token = authorization.substring(7);

    // 토큰 검증 (예제용 하드코딩)
    if (token !== 'valid-token') {
      // 인증은 되었으나 권한이 없는 경우 → 403
      return reply.code(403).send({
        error: 'Forbidden',
        message: '유효하지 않은 토큰입니다',
      });
    }

    /**
     * 실제 시스템에서는:
     * - JWT payload 에서 role / scope 추출
     * - DB 또는 Redis에서 사용자 권한 조회
     */
    const role = token.includes('admin') ? 'admin' : 'user';

    // 응답 헤더에 사용자 역할 정보 추가 (디버그/게이트웨이용)
    reply.header('X-User-Role', role);

    return {
      message: '인증된 사용자입니다',
      role,
    };
  });
}

///////////////////////////////////////

import Fastify from 'fastify';

/**
 * 테스트 및 서버 실행용 App Builder
 * - Vitest에서는 이 함수로 app 생성 후 inject() 사용
 * - 실제 서버에서는 listen 전에 동일 함수 사용
 */
export function buildApp() {
  const app = Fastify({
    logger: false, // 테스트 시 불필요한 로그 제거
  });

  /**
   * 라우트 플러그인 등록
   * - prefix 옵션을 주면 /api 자동 적용 가능
   */
  app.register(contentRoutes);

  return app;
}
