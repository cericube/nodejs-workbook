import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { buildApp } from '../../src/ch04/4-2-1.request-inputs-app';

import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

describe('Query Parameter 테스트', () => {
  beforeAll(async () => {
    console.log('Fastify 인스턴스 시작....');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    console.log('Fastify 인스턴스 종료....');
    await app.close();
  });

  //
  it('1. 쿼리 파라미터에 대해 올바른 결과를 반환한다', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/search?q=fastify한글',
    });
    //
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: 'fastify한글' });
  });

  //
  it('2. 경로 파라미터에 대해 올바른 결과를 반환한다.', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/123',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: '123' });
  });

  //
  it('3. JSON Body 에 대해 올바른 결과를 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      body: { name: 'Alice한글', age: 30 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'Alice한글', age: 30 });
  });

  it('3-1. 이름이 없는 경우 400을 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      body: { age: 30 },
    });

    expect(res.statusCode).toBe(400);
  });

  //
  it('4. Custom Header 를 읽고 결과를 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/whoami',
      headers: {
        'user-agent': 'VitestClient/1.0',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ userAgent: string }>().userAgent).toBe('VitestClient/1.0');
  });

  //
  it('5. verbose=true 일 경우 {Verbose: body}를 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/multi?verbose=true',
      body: { title: 'Test' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      message: 'Verbose: Test',
    });
  });

  //
  it('5. verbose=false 일 경우 그냥 body 값을 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/multi?verbose=false',
      body: { title: 'Test' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      message: 'Test',
    });
  });
});
