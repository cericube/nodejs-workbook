import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 모든 예제가 같은 데이터베이스를 사용하므로 파일을 순차 실행합니다.
    fileParallelism: false,
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
});
