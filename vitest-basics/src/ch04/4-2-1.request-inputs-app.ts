import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Query Parameter를 응답으로 반환하는 Route입니다.
export function registerSearchRoute(app: FastifyInstance) {
  app.route({
    method: 'GET',
    url: '/search',
    schema: {
      querystring: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
      response: {
        200: {
          type: 'object',
          properties: { result: { type: 'string' } },
        },
      },
    },
    handler: (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { q: string };
      return reply.send({ result: query.q });
    },
  });
}

// URL의 id 값을 응답으로 반환하는 Route입니다.
export function registerUsersRoute(app: FastifyInstance) {
  app.route({
    method: 'GET',
    url: '/users/:id',
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: (request: FastifyRequest) => {
      const params = request.params as { id: string };
      return { id: params.id };
    },
  });
}

// 전달받은 JSON Body를 그대로 반환하는 Route입니다.
export function registerEchoRoute(app: FastifyInstance) {
  app.route({
    method: 'POST',
    url: '/echo',
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      },
    },
    handler: (request: FastifyRequest) => {
      const body = request.body as { name: string; age?: number };
      return body;
    },
  });
}

// User-Agent Header를 읽어 응답으로 반환하는 Route입니다.
export function registerWhoamiRoute(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'],
    url: '/whoami',
    handler: (request: FastifyRequest) => {
      const agent = request.headers['user-agent'] ?? 'unknown';
      return { userAgent: agent };
    },
  });
}

export function buildApp() {
  const app = Fastify();

  app.register(registerSearchRoute);
  app.register(registerUsersRoute);
  app.register(registerEchoRoute);
  app.register(registerWhoamiRoute);

  return app;
}
