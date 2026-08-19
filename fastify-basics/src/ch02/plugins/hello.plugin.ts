// /src/ch02/hello.plugin.ts
/* eslint-disable @typescript-eslint/require-await */

import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';

// declare는 TypeScript에게 “이 타입이나 값은 실제로 존재한다고 가정하고 타입 검사에 반영해 줘”라고 알려주는 키워드

// Fastify가 기본으로 제공하는 타입에 이 플러그인의 사용자 정의 타입을 합칩니다.
// 이 선언은 TypeScript에 타입 정보를 알려 줄 뿐이며, 실제 속성이나 메서드를
// 생성하지는 않습니다. 런타임 등록은 아래의 decorate/decorateRequest가 담당합니다.
declare module 'fastify' {
  // 모든 요청(request) 객체에서 사용할 사용자 정의 속성입니다.
  interface FastifyRequest {
    // onRequest 훅에서 요청이 시작된 시각을 ISO 8601 문자열로 저장합니다.
    timestamp: string;
  }

  // fastify 인스턴스에 추가해서 여러 라우트가 함께 사용할 메서드들입니다.
  interface FastifyInstance {
    // 이름을 받아 인사말을 반환하며, 아래의 fastify.decorate('sayHello', ...)
    // 코드가 실제 구현을 Fastify 인스턴스에 등록합니다.
    sayHello(name: string): string;
  }
}

// 여러 라우트에서 사용할 함수와 요청 속성을 하나의 플러그인으로 정의합니다.
export default fp(async (fastify) => {
  // 1. decorate는 Fastify 인스턴스에 사용자 정의 속성이나 메서드를 추가합니다.
  // 첫 번째 인수인 'sayHello'는 추가할 메서드의 이름이고,
  // 두 번째 인수는 fastify.sayHello(...)를 호출할 때 실행될 실제 함수입니다.
  // 플러그인이 등록된 범위의 라우트에서는 이 메서드를 공통으로 사용할 수 있습니다.
  fastify.decorate('sayHello', (name: string) => {
    // 전달받은 이름을 템플릿 리터럴(${...})에 넣어 인사말을 반환합니다.
    // 예: fastify.sayHello('Fastify') → 'Hello, Fastify!'
    return `Hello, ${name}!`;
  });

  // 2. 모든 Fastify 요청 객체에 `timestamp` 접근자 속성을 추가합니다.
  // 접근자(getter/setter)를 사용하면 외부에서는 request.timestamp처럼 간단히
  // 사용하면서, 실제 값은 내부 속성인 request._timestamp에 보관할 수 있습니다.
  fastify.decorateRequest('timestamp', {
    // request.timestamp를 읽을 때 호출됩니다.
    // 여기서 `this`는 현재 요청 객체이며, 해당 요청에 저장된 값을 반환합니다.
    getter(this: FastifyRequest) {
      // `FastifyRequest & { _timestamp: string }`는 기존 요청 타입에
      // 내부 속성 `_timestamp`가 있다고 TypeScript에 알려 주는 타입 단언입니다.
      // 실제 객체를 변환하거나 새로운 객체를 만드는 코드는 아닙니다.
      return (this as FastifyRequest & { _timestamp: string })._timestamp;
    },
    // request.timestamp = 값 형태로 값을 대입할 때 호출됩니다.
    // value에는 대입한 문자열이 전달되고, `this`는 현재 요청 객체를 가리킵니다.
    setter(this: FastifyRequest, value: string) {
      // 공개 접근자인 timestamp로 받은 값을 내부 저장 공간 `_timestamp`에
      // 기록합니다. 요청 객체마다 저장되므로 서로 다른 요청의 값과 섞이지 않습니다.
      (this as FastifyRequest & { _timestamp: string })._timestamp = value;
    },
  });

  // 3. onRequest 훅은 Fastify가 요청을 받은 직후, 라우트 핸들러를 실행하기 전에
  // 호출됩니다. 따라서 이후의 훅과 라우트 핸들러에서 요청 시작 시각을 사용할 수 있습니다.
  fastify.addHook('onRequest', async (request) => {
    // 현재 시각을 ISO 8601 형식의 문자열로 만듭니다.
    // 예: '2026-08-19T12:34:56.789Z' (`Z`는 UTC 기준이라는 뜻입니다.)
    // 이 값을 timestamp에 대입하면 위에서 정의한 setter가 실행되어
    // 현재 요청 객체의 내부 `_timestamp` 속성에 값이 저장됩니다.
    request.timestamp = new Date().toISOString();
  });
});
