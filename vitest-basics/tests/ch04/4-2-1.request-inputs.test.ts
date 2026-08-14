import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/ch04/4-2-1.request-inputs-app';

describe('Query, Path, Body, Header 테스트', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Query Parameter에 맞는 결과를 반환합니다', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/search?q=fastify한글',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ result: 'fastify한글' });
  });

  it('Path Parameter에 맞는 결과를 반환합니다', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/123',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: '123' });
  });

  it('JSON Body에 맞는 결과를 반환합니다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      body: { name: 'Alice한글', age: 30 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: 'Alice한글', age: 30 });
  });

  it('name이 없으면 400을 반환합니다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      body: { age: 30 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('사용자 정의 Header를 읽어 결과를 반환합니다', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/whoami',
      headers: { 'user-agent': 'VitestClient/1.0' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ userAgent: string }>().userAgent).toBe('VitestClient/1.0');
  });
});
