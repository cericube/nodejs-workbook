import { describe, expect, it } from 'vitest';
import { redis } from '../../src/shared/redis';

/**
 * 공통 setup에서 연결된 실제 Redis 서버를 대상으로 읽기·쓰기를 검증합니다.
 * 테스트 전 flushDb()가 실행되므로 다른 테스트가 남긴 Key의 영향을 받지 않습니다.
 */
describe('Redis Connection', () => {
  it('Redis에 값을 저장하고 조회할 수 있다', async () => {
    // Redis에 문자열을 저장한 뒤 같은 Key로 조회합니다.
    await redis.set('greeting', 'Hello, Redis!');

    const value = await redis.get('greeting');

    // SET으로 저장한 문자열이 손실이나 변환 없이 반환되는지 확인합니다.
    expect(value).toBe('Hello, Redis!');
  });
});
