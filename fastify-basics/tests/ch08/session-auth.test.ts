import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { buildCh08App } from '../../src/ch08/app.js';

const TEST_SECRET = 'test-session-secret-with-at-least-32-characters';

/** Set-Cookie 응답에서 다음 요청의 Cookie 헤더에 넣을 이름과 값만 추출합니다. */
function extractCookie(setCookieHeader: string | string[] | undefined) {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  assert.ok(header, 'Set-Cookie 헤더가 필요합니다.');

  const cookie = header.split(';')[0];
  assert.ok(cookie, 'Session Cookie 값을 찾을 수 없습니다.');
  return cookie;
}

describe('ch08 Server Session과 HttpOnly Cookie 인증', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // 테스트마다 새 Memory Store를 가진 앱을 만들어 세션 데이터가 서로 섞이지 않게 합니다.
    app = buildCh08App({ sessionSecret: TEST_SECRET, secureCookie: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('로그인하지 않은 사용자의 보호 API 요청을 거절한다', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/me' });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      code: 'UNAUTHORIZED',
      message: '로그인이 필요합니다.',
    });
  });

  it('잘못된 로그인 정보에는 Session Cookie를 발급하지 않는다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: 'learner@example.com', password: 'wrong-password' },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['set-cookie'], undefined);
  });

  it('로그인 쿠키로 새 요청에서도 사용자 정보를 조회한다', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: 'learner@example.com', password: 'Fastify12!' },
    });

    assert.equal(loginResponse.statusCode, 200);
    assert.deepEqual(loginResponse.json(), {
      user: { id: 100, email: 'learner@example.com', role: 'USER' },
    });

    const setCookie = loginResponse.headers['set-cookie'];
    const setCookieText = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    assert.match(setCookieText ?? '', /HttpOnly/i);
    assert.match(setCookieText ?? '', /SameSite=Lax/i);

    // 브라우저의 자동 쿠키 전송을 Cookie 헤더로 재현합니다.
    const cookie = extractCookie(setCookie);
    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });

    assert.equal(meResponse.statusCode, 200);
    assert.deepEqual(meResponse.json(), {
      user: { id: 100, email: 'learner@example.com', role: 'USER' },
    });
    // rolling: true이므로 인증된 요청에서도 갱신된 만료 시각의 쿠키가 내려옵니다.
    assert.ok(meResponse.headers['set-cookie']);
  });

  it('로그아웃하면 기존 Session ID로 보호 API를 호출할 수 없다', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: 'learner@example.com', password: 'Fastify12!' },
    });
    const cookie = extractCookie(loginResponse.headers['set-cookie']);

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: { cookie },
    });

    assert.equal(logoutResponse.statusCode, 200);
    assert.deepEqual(logoutResponse.json(), { success: true });

    const expiredCookie = logoutResponse.headers['set-cookie'];
    const expiredCookieText = Array.isArray(expiredCookie)
      ? expiredCookie.join('; ')
      : (expiredCookie ?? '');
    assert.match(expiredCookieText, /session_id=/);

    // 브라우저가 삭제 요청을 반영하기 전의 쿠키를 보내도 Store 레코드는 이미 없어야 합니다.
    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });

    assert.equal(meResponse.statusCode, 401);
  });

  it('서명이 변조된 Session ID를 인증에 사용하지 않는다', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: 'learner@example.com', password: 'Fastify12!' },
    });
    const cookie = extractCookie(loginResponse.headers['set-cookie']);
    const tamperedCookie = `${cookie}tampered`;

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: tamperedCookie },
    });

    assert.equal(response.statusCode, 401);
  });
});
