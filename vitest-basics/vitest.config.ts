import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // describe, it, expect 등을 import 없이 전역으로 사용합니다.
    globals: true,

    // 테스트를 Node.js 런타임에서 실행합니다.
    environment: 'node',

    // V8 엔진을 사용하여 코드 커버리지를 수집합니다.
    coverage: {
      provider: 'v8',
      // 콘솔, JSON 파일과 HTML 문서로 결과를 생성합니다.
      reporter: ['text', 'json', 'html'],
      // 실행되지 않은 소스 파일도 전체 커버리지 계산에 포함합니다.
      include: ['src/**/*.ts'],
      // 테스트 코드는 커버리지 측정 대상에서 제외합니다.
      exclude: ['tests/**', '**/*.test.ts'],
    },

    // tests 디렉터리 아래의 .test.ts 파일만 실행합니다.
    include: ['tests/**/*.test.ts'],
  },
});
