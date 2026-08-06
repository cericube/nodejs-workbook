import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 모든 테스트가 같은 SQLite 데이터베이스와 Redis DB를 공유하므로
    // 테스트 파일을 순차적으로 실행해 초기화 작업 간 충돌을 방지합니다.
    fileParallelism: false,
    // 각 테스트 파일을 실행하기 전에 DB 초기화 및 연결 종료 훅을 등록합니다.
    setupFiles: ['./tests/setup.ts'],
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
});
