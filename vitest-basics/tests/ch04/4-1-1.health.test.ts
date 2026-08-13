// /tests/ch04/4-1-1.health.test.ts
// Fastify 서버를 실제로 listen 하지 않고 inject()로 API를 호출하는 테스트 예제

import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { buildApp } from '../../src/ch04/4-1-1.health-app';
import type { FastifyInstance } from 'fastify';

// 테스트 전역에서 사용할 Fastify 인스턴스
// 각 테스트마다 새로 만들지 않고, describe 블록 단위로 공유한다.
let app: FastifyInstance;

describe('API Tests', () => {
  // 모든 테스트가 실행되기 전에 한 번만 실행되는 훅
  // Fastify 인스턴스를 생성하고 내부 플러그인 로딩을 완료한다.
  beforeAll(async () => {
    app = buildApp();
    console.log('Fastify 인스턴스 시작....');

    // register된 플러그인과 라우트가 모두 준비될 때까지 대기
    // ready()를 호출하지 않으면 일부 훅이나 데코레이터가 아직 등록되지 않은 상태일 수 있다.
    await app.ready();
  });

  // 모든 테스트가 끝난 뒤 한 번만 실행되는 훅
  // Fastify 인스턴스를 정리하여 리소스(타이머, 커넥션 등)를 해제한다.
  afterAll(async () => {
    console.log('Fastify 인스턴스 종료....');
    await app.close();
  });

  // 개별 테스트 케이스
  it('GET /health should work', async () => {
    // 실제 HTTP 요청을 보내지 않고,
    // Fastify 내부 라우터로 직접 요청을 주입(inject)한다.
    // 네트워크 포트 바인딩 없이도 API 동작을 검증할 수 있다.
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    // HTTP 상태 코드 검증
    expect(res.statusCode).toBe(200);

    // Content-Type 헤더가 JSON인지 확인
    // charset=utf-8 등이 붙을 수 있으므로 정규식으로 검사
    expect(res.headers['content-type']).toMatch(/application\/json/);

    // 응답 body를 JSON으로 파싱하여 실제 데이터 검증
    // res.json()은 payload(JSON 문자열)를 파싱한 결과를 반환한다.
    expect(res.json()).toEqual({ ok: true });
  });
});
