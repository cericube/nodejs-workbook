// tests/ch07/log-list.service.test.ts

import { describe, expect, it } from 'vitest';

import { LogListService } from '../../src/ch07/log-list.service.js';
import { RedisKey } from '../../src/shared/redis-key.js';
import { redis } from '../../src/shared/redis.js';

/** 최근 로그 버퍼의 최신순, 크기 제한, 레벨 필터링을 검증합니다. */
describe('LogListService', () => {
  const service = new LogListService();

  it('로그와 context를 저장하고 최신 로그부터 조회한다', async () => {
    const first = await service.addLog({ level: 'INFO', message: '시작' });
    const second = await service.addLog({
      level: 'WARN',
      message: '느린 요청',
      context: { durationMs: 1500, retryable: true },
    });

    await expect(service.getRecentLogs()).resolves.toEqual([second, first]);
  });

  it('지정한 개수만 남기고 오래된 로그를 제거한다', async () => {
    await service.addLog({ level: 'INFO', message: '첫 번째' }, 2);
    const second = await service.addLog({ level: 'WARN', message: '두 번째' }, 2);
    const third = await service.addLog({ level: 'ERROR', message: '세 번째' }, 2);

    await expect(service.getRecentLogs()).resolves.toEqual([third, second]);
    await expect(service.getLogCount()).resolves.toBe(2);
  });

  it('최근 로그 중 ERROR 레벨만 반환한다', async () => {
    await service.addLog({ level: 'INFO', message: '정상' });
    const errorLog = await service.addLog({ level: 'ERROR', message: '실패' });
    await service.addLog({ level: 'WARN', message: '경고' });

    await expect(service.getRecentErrorLogs()).resolves.toEqual([errorLog]);
  });

  it('잘못된 JSON 로그는 조회 결과에서 제외한다', async () => {
    const validLog = await service.addLog({ level: 'INFO', message: '정상 로그' });
    await redis.lPush(RedisKey.list.logBuffer(), 'invalid-json');

    await expect(service.getRecentLogs()).resolves.toEqual([validLog]);
  });

  it('동시에 로그를 추가해도 설정한 최대 개수를 유지한다', async () => {
    // 각 Transaction의 LPUSH와 LTRIM이 연속 실행되어 최종 List 크기가 제한되는지 확인합니다.
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        service.addLog({ level: 'INFO', message: `로그 ${index}` }, 5),
      ),
    );

    await expect(service.getLogCount()).resolves.toBe(5);
  });

  it('로그 버퍼 전체를 삭제한다', async () => {
    await service.addLog({ level: 'INFO', message: '삭제할 로그' });

    await service.clearLogs();

    await expect(service.getRecentLogs()).resolves.toEqual([]);
    await expect(service.getLogCount()).resolves.toBe(0);
  });
});
