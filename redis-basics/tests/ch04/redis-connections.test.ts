import { describe, expect, it } from 'vitest';
import { redis } from '../../src/shared/redis.js';

describe('Redis Connection', () => {
  it('Redis에 값을 저장하고 조회할 수 있다', async () => {
    // Redis에 문자열을 저장한 뒤 같은 Key로 조회합니다.
    await redis.set('greeting', 'Hello, Redis!');

    const value = await redis.get('greeting');

    expect(value).toBe('Hello, Redis!');
  });
});
