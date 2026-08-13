import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/ch04/4-3-2.access-control-app';
import type { FastifyInstance } from 'fastify';

// Fastify inject의 json()은 기본적으로 any를 반환합니다. 이 통합 테스트는 각 응답 필드를
// assertion으로 검증하므로 해당 반환형에서 파생되는 unsafe 규칙을 파일 단위로 제외합니다.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('Secure API - 인증/인가 테스트', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // 테스트 헬퍼: Authorization 헤더 생성
  const withAuth = (token: string) => ({
    headers: { authorization: `Bearer ${token}` },
  });

  describe('인증 필수 엔드포인트 - GET /api/profile', () => {
    it('[401] Authorization 헤더가 없으면 실패합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
      });

      expect(response.statusCode).toBe(401);

      const body = response.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('MISSING_AUTH_HEADER');
      expect(body.message).toContain('Authorization 헤더');
    });

    it('[401] Bearer 형식이 아니면 실패합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        headers: {
          authorization: 'Basic some-token',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = response.json();
      expect(body.code).toBe('INVALID_AUTH_FORMAT');
    });

    it('[401] 유효하지 않은 토큰으로 실패합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        ...withAuth('invalid-token'),
      });

      expect(response.statusCode).toBe(401);

      const body = response.json();
      expect(body.code).toBe('INVALID_TOKEN');
    });

    it('[401] 만료된 토큰으로 실패합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        ...withAuth('expired-token'),
      });

      expect(response.statusCode).toBe(401);
    });

    it('[200] 유효한 토큰으로 프로필을 조회합니다 - admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        ...withAuth('admin-token'),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.userId).toBe('1');
      expect(body.email).toBe('admin@example.com');
      expect(body.role).toBe('admin');
    });

    it('[200] 유효한 토큰으로 프로필을 조회합니다 - user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        ...withAuth('user-token'),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.userId).toBe('2');
      expect(body.role).toBe('user');
    });

    it('[200] 유효한 토큰으로 프로필을 조회합니다 - guest', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        ...withAuth('guest-token'),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.role).toBe('guest');
    });
  });

  describe('권한 기반 접근 제어', () => {
    describe('POST /api/documents - write 권한 필요', () => {
      it('[403] 읽기 권한만 있으면 실패합니다', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/documents',
          ...withAuth('guest-token'), // read 권한만 있음
        });

        expect(response.statusCode).toBe(403);

        const body = response.json();
        expect(body.error).toBe('Forbidden');
        expect(body.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(body.details.required).toContain('write');
        expect(body.details.actual).not.toContain('write');
      });

      it('[200] 쓰기 권한이 있으면 성공합니다', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/documents',
          ...withAuth('user-token'), // write 권한 있음
        });

        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.message).toContain('생성되었습니다');
        expect(body.createdBy).toBe('2'); // user-token의 userId
      });

      it('[200] 관리자도 성공합니다', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/documents',
          ...withAuth('admin-token'),
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('DELETE /api/documents/:id - delete 권한 필요', () => {
      it('[403] 일반 사용자는 삭제할 수 없습니다', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/api/documents/1',
          ...withAuth('user-token'), // delete 권한 없음
        });

        expect(response.statusCode).toBe(403);

        const body = response.json();
        expect(body.details.required).toContain('delete');
      });

      it('[200] 관리자는 삭제할 수 있습니다', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/api/documents/1',
          ...withAuth('admin-token'), // delete 권한 있음
        });

        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.documentId).toBe('1');
        expect(body.deletedBy).toBe('1');
      });
    });

    describe('GET /api/public-documents - read 권한 필요', () => {
      it('[200] 모든 인증된 사용자가 접근할 수 있습니다', async () => {
        const tokens = ['admin-token', 'user-token', 'guest-token'];

        for (const token of tokens) {
          const response = await app.inject({
            method: 'GET',
            url: '/api/public-documents',
            ...withAuth(token),
          });

          expect(response.statusCode).toBe(200);

          const body = response.json();
          expect(body.documents).toBeDefined();
          expect(Array.isArray(body.documents)).toBe(true);
        }
      });
    });
  });

  describe('역할 기반 접근 제어', () => {
    describe('GET /api/admin/users - admin 역할 필요', () => {
      it('[403] 일반 사용자는 접근할 수 없습니다', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/users',
          ...withAuth('user-token'),
        });

        expect(response.statusCode).toBe(403);

        const body = response.json();
        expect(body.error).toBe('Forbidden');
        expect(body.code).toBe('INVALID_ROLE');
        expect(body.details.required).toContain('admin');
        expect(body.details.actual).toBe('user');
      });

      it('[403] 게스트는 접근할 수 없습니다', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/users',
          ...withAuth('guest-token'),
        });

        expect(response.statusCode).toBe(403);

        const body = response.json();
        expect(body.details.actual).toBe('guest');
      });

      it('[200] 관리자는 사용자 목록을 조회할 수 있습니다', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/users',
          ...withAuth('admin-token'),
        });

        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.users).toBeDefined();
        expect(Array.isArray(body.users)).toBe(true);
        expect(body.users.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/admin/manage-users - admin 역할 + 복수 권한 필요', () => {
      it('[403] 일반 사용자는 접근할 수 없습니다', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/admin/manage-users',
          ...withAuth('user-token'),
        });

        expect(response.statusCode).toBe(403);

        const body = response.json();
        expect(body.code).toBe('INVALID_ROLE');
      });

      it('[200] 관리자는 사용자 관리 작업을 수행할 수 있습니다', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/admin/manage-users',
          ...withAuth('admin-token'),
        });

        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.message).toContain('완료되었습니다');
      });
    });
  });

  describe('인증 시나리오 통합 테스트', () => {
    it('동일한 토큰으로 여러 요청을 연속으로 처리합니다', async () => {
      const token = 'user-token';

      // 1. 프로필 조회
      const profileResponse = await app.inject({
        method: 'GET',
        url: '/api/profile',
        ...withAuth(token),
      });
      expect(profileResponse.statusCode).toBe(200);

      // 2. 문서 생성
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/documents',
        ...withAuth(token),
      });
      expect(createResponse.statusCode).toBe(200);

      // 3. 공개 문서 조회
      const docsResponse = await app.inject({
        method: 'GET',
        url: '/api/public-documents',
        ...withAuth(token),
      });
      expect(docsResponse.statusCode).toBe(200);

      // 4. 삭제 시도 (권한 없음)
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/api/documents/1',
        ...withAuth(token),
      });
      expect(deleteResponse.statusCode).toBe(403);
    });

    it('토큰 없이 접근 가능한 엔드포인트와 구분됩니다', async () => {
      // 보호된 엔드포인트
      const secureResponse = await app.inject({
        method: 'GET',
        url: '/api/profile',
      });
      expect(secureResponse.statusCode).toBe(401);

      // 공개 엔드포인트 (예시)
      const publicResponse = await app.inject({
        method: 'GET',
        url: '/health',
      });
      expect(publicResponse.statusCode).toBe(200);
    });
  });

  describe('에러 응답 형식 일관성', () => {
    it('모든 401 응답은 일관된 형식을 갖습니다', async () => {
      const scenarios = [
        { url: '/api/profile', method: 'GET' as const, auth: undefined },
        { url: '/api/documents', method: 'POST' as const, auth: 'Basic invalid' },
        { url: '/api/admin/users', method: 'GET' as const, auth: 'Bearer invalid' },
      ];

      for (const scenario of scenarios) {
        const response = await app.inject({
          method: scenario.method,
          url: scenario.url,
          headers: scenario.auth ? { authorization: scenario.auth } : {},
        });

        // 조건문으로 감싸면 401이 아닌 응답이 assertion 없이 통과할 수 있습니다.
        expect(response.statusCode).toBe(401);
        const body = response.json();
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('code');
        expect(body.error).toBe('Unauthorized');
      }
    });

    it('모든 403 응답은 일관된 형식을 갖습니다', async () => {
      const scenarios = [
        { url: '/api/documents/1', method: 'DELETE' as const, token: 'user-token' },
        { url: '/api/admin/users', method: 'GET' as const, token: 'user-token' },
      ];

      for (const scenario of scenarios) {
        const response = await app.inject({
          method: scenario.method,
          url: scenario.url,
          ...withAuth(scenario.token),
        });

        expect(response.statusCode).toBe(403);

        const body = response.json();
        expect(body).toHaveProperty('error', 'Forbidden');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('details');
      }
    });
  });

  describe('토큰 형식 변형 테스트', () => {
    it('Bearer 앞뒤 공백을 처리합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        headers: {
          authorization: '  Bearer   admin-token  ',
        },
      });

      // 현재 계약은 정확한 `Bearer ` 접두사를 요구하므로 앞 공백이 있으면 거부합니다.
      expect(response.statusCode).toBe(401);
    });

    it('Bearer 대소문자 구분을 확인합니다', async () => {
      const variations = ['bearer', 'BEARER', 'Bearer'];

      for (const prefix of variations) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/profile',
          headers: {
            authorization: `${prefix} admin-token`,
          },
        });

        // 'Bearer'만 정확히 매치되어야 함
        if (prefix === 'Bearer') {
          expect(response.statusCode).toBe(200);
        } else {
          expect(response.statusCode).toBe(401);
        }
      }
    });

    it('빈 토큰을 거부합니다', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        headers: {
          authorization: 'Bearer ',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
