import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // describe, it, expect 등을 import 없이 전역으로 사용합니다.
    // globals: true, 의도적으로 주석 처리하였음

    // 테스트를 Node.js 런타임에서 실행합니다.
    environment: 'node',

    // 테스트 파일들이 같은 SQLite DB를 공유하고 매 테스트 후 테이블을 비우므로 파일을 순차 실행합니다.
    fileParallelism: false,

    // V8 엔진을 사용하여 코드 커버리지를 수집합니다.
    coverage: {
      provider: 'v8',
      // 콘솔, JSON 파일과 HTML 문서로 결과를 생성합니다.
      reporter: ['text', 'json', 'html'],
      // 생성한 커버리지 리포트를 프로젝트의 coverage 디렉터리에 저장합니다.
      reportsDirectory: './coverage',
      // 실행되지 않은 소스 파일도 전체 커버리지 계산에 포함합니다.
      include: ['src/**/*.ts'],
      // 진입점, 타입 선언, 공통 타입과 테스트 파일은 측정 대상에서 제외합니다.
      exclude: ['src/main.ts', '**/*.d.ts', 'src/types/**', 'tests/**', '**/*.test.ts'],
      // 항목별 최소 기준에 미달하면 커버리지 실행을 실패로 처리합니다.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },

    // tests 디렉터리 아래의 .test.ts 파일만 실행합니다.
    include: ['tests/**/*.test.ts'],
  },
});
