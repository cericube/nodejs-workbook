import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runReadCommitted, runRepeatableRead } from '../../src/ch07/isolation-level-examples';
import { prisma } from '../../src/shared/database';

const EMAIL_DOMAIN = '@ch07-isolation-test.local';
const INITIAL_DISPLAY_NAME = '격리 수준 초기 이름';
const UPDATED_DISPLAY_NAME = '외부 트랜잭션 변경 이름';

/**
 * 외부 커밋이 같은 트랜잭션의 두 번째 SELECT에 보이는 범위를 비교합니다.
 */
describe('ch07 트랜잭션 격리 수준', () => {
  beforeAll(async () => {
    // 두 격리 수준은 서로 다른 email을 사용해 실험 상태가 섞이지 않게 합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    // 격리 수준 실험 함수가 upsert한 User만 조건부로 정리합니다.
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  it('ReadCommitted는 두 번째 SELECT에서 외부 커밋 값을 읽는다', async () => {
    const result = await runReadCommitted(`read-committed${EMAIL_DOMAIN}`);

    // SELECT마다 새 스냅샷을 사용하므로 두 번째 값만 writer의 변경을 반영합니다.
    expect(result.firstRead.displayName).toBe(INITIAL_DISPLAY_NAME);
    expect(result.secondRead.displayName).toBe(UPDATED_DISPLAY_NAME);
    expect(result.committedUser.displayName).toBe(UPDATED_DISPLAY_NAME);
  });

  it('RepeatableRead는 두 SELECT에서 같은 스냅샷 값을 읽는다', async () => {
    const result = await runRepeatableRead(`repeatable-read${EMAIL_DOMAIN}`);

    // reader가 유지하는 스냅샷에서는 writer의 중간 커밋이 보이지 않아야 합니다.
    expect(result.firstRead.displayName).toBe(INITIAL_DISPLAY_NAME);
    expect(result.secondRead.displayName).toBe(INITIAL_DISPLAY_NAME);
    // reader의 스냅샷과 별개로 writer가 변경한 실제 DB 값은 커밋됩니다.
    expect(result.committedUser.displayName).toBe(UPDATED_DISPLAY_NAME);
  });
});
