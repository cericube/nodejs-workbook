import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/ch04/4-3-1.authentication-and-authorization-app';
import type { FastifyInstance } from 'fastify';

describe('인증/인가 테스트 ', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('401: Authorization 헤더가 없으면 인증 실패', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      code: 'UNAUTHORIZED',
      message: '토큰이 필요합니다.',
    });
  });

  //
  it('403: 잘못된 토큰이면 접근 금지', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(res.statusCode).toBe(403);
    expect(await res.json()).toEqual({
      code: 'FORBIDDEN',
      message: '권한이 없습니다.',
    });
  });

  it('200: 올바른 토큰이면 사용자 정보 반환', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: 1, name: 'Jane' },
    });
  });
});

///////////////////////////////////////////////////
describe('GET /admin (adminRoutes)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('401: Authorization 헤더가 없으면 접근 불가', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      code: 'UNAUTHORIZED',
      message: '토큰 필요',
    });
  });

  it('403: 일반 유저 토큰이면 관리자 접근 거부', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: {
        authorization: 'Bearer user-token',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(await res.json()).toEqual({
      code: 'FORBIDDEN',
      message: '관리자 전용입니다.',
    });
  });

  it('200: 관리자 토큰이면 접근 허용', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: {
        authorization: 'Bearer admin-token',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(await res.json()).toEqual({
      status: '관리자 접근 성공',
    });
  });

  it('403: 잘못된 토큰이면 접근금지', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: {
        authorization: 'Bearer aaaa-token',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(await res.json()).toEqual({
      status: '잘못된 접근',
    });
  });
});
