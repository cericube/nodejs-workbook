import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

/**
 * 테스트용 Mock DB 객체
 * 실제 DB 대신 메모리 배열을 사용하여 상태 변화를 시뮬레이션합니다.
 */
const mockDb = {
  // 사용자 목록 (테스트 대상 데이터)
  users: [] as string[],

  /**
   * DB 연결 시뮬레이션
   * 실제 프로젝트에서는 커넥션 풀 생성, 네트워크 연결 등이 수행됩니다.
   */
  // Promise를 반환하므로 비동기 beforeAll 훅에서 완료를 기다릴 수 있습니다.
  connect: () => Promise.resolve().then(() => console.log('DB 연결 성공')),

  /**
   * DB 연결 종료 시뮬레이션
   * 테스트 종료 후 리소스 정리를 담당합니다.
   */
  disconnect: () => Promise.resolve().then(() => console.log('DB 연결 종료')),

  /**
   * 테스트 데이터 초기화
   * 각 테스트가 서로 영향을 주지 않도록 상태를 리셋합니다.
   */
  clear: () => {
    mockDb.users = [];
  },
};

describe('라이프 사이클 테스트', () => {
  /**
   * beforeAll
   * - describe 블록 내 테스트가 시작되기 전에 "단 한 번" 호출됩니다.
   * - 공통 리소스 초기화 (DB 연결, 서버 기동 등)에 적합합니다.
   */
  beforeAll(async () => {
    await mockDb.connect();
  });

  /**
   * afterAll
   * - describe 블록 내 모든 테스트가 끝난 후 "단 한 번" 호출됩니다.
   * - 공통 리소스 해제 (DB 연결 종료, 서버 종료 등)에 사용합니다.
   */
  afterAll(async () => {
    await mockDb.disconnect();
  });

  /**
   * beforeEach
   * - 각 테스트(it) 실행 직전에 매번 호출됩니다.
   * - 테스트 간 상태 격리를 위해 데이터 초기화 용도로 사용합니다.
   */
  beforeEach(() => {
    mockDb.clear();
    console.log('테스트 데이터 초기화.');
  });

  /**
   * afterEach
   * - 각 테스트(it) 실행 직후마다 호출됩니다.
   * - 테스트가 남긴 상태를 정리하거나 로그를 남길 때 활용합니다.
   */
  afterEach(() => {
    mockDb.clear();
    console.log('테스트 데이터 정리.');
  });

  /**
   * 첫 번째 테스트 케이스
   * - 사용자를 추가하는 기본 동작 검증
   */
  it('새로운 사용자를 추가할 수 있다', () => {
    // 사용자 추가
    mockDb.users.push('Alice');

    // 배열 길이는 전용 matcher로 의도를 명확하게 표현합니다.
    expect(mockDb.users).toHaveLength(1);

    // 'Alice'가 포함되어 있는지 검증
    expect(mockDb.users).toContain('Alice');
  });

  /**
   * 두 번째 테스트 케이스
   * - 이전 테스트의 데이터가 남아있지 않아야 함을 검증
   * - beforeEach 훅이 정상적으로 동작하는지 확인합니다.
   */
  it('각 테스트는 독립적인 환경을 가진다(데이터는 비어 있어야 한다.)', () => {
    // beforeEach에서 clear()가 실행되었기 때문에 빈 배열이어야 합니다.
    expect(mockDb.users).toHaveLength(0);
  });
});
