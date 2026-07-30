import js from '@eslint/js';
import json from '@eslint/json';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  /**
   * --------------------------------------------------------------------
   * 1. 전역 무시 패턴
   * --------------------------------------------------------------------
   *
   * ESLint가 검사하지 않을 빌드 산출물과 자동 생성 파일을 지정합니다.
   *
   * `globalIgnores()`는 파일이나 디렉터리를 ESLint의 전체 검사 대상에서
   * 제외할 때 사용하는 Flat Config 전용 헬퍼 함수입니다.
   *
   * `node_modules`와 `.git`은 ESLint가 기본적으로 제외하지만,
   * 설정 의도를 명확하게 보여주기 위해 필요에 따라 작성할 수 있습니다.
   */
  globalIgnores([
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/.git/**',
    '**/.vscode/**',
    '**/*.log',
  ]),

  /**
   * --------------------------------------------------------------------
   * 2. JavaScript 설정
   * --------------------------------------------------------------------
   *
   * ESLint 설정 파일이나 프로젝트 내부의 JavaScript 파일을 검사합니다.
   *
   * JavaScript 파일에는 ESLint 공식 권장 규칙을 적용하고,
   * Node.js 전역 변수를 사용할 수 있도록 설정합니다.
   */
  {
    files: ['**/*.{js,mjs}'],

    extends: [js.configs.recommended],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.node,
      },
    },
  },

  /**
   * --------------------------------------------------------------------
   * 3. CommonJS JavaScript 설정
   * --------------------------------------------------------------------
   *
   * `.cjs` 파일은 CommonJS 모듈로 해석합니다.
   *
   * `require`, `module.exports`와 같은 CommonJS 문법을 사용하는 파일에
   * `sourceType: 'commonjs'`를 적용합니다.
   */
  {
    files: ['**/*.cjs'],

    extends: [js.configs.recommended],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',

      globals: {
        ...globals.node,
      },
    },
  },

  /**
   * --------------------------------------------------------------------
   * 4. TypeScript ESM 설정
   * --------------------------------------------------------------------
   *
   * `.ts`와 `.mts` 파일에 TypeScript 권장 규칙을 적용합니다.
   *
   * `recommendedTypeChecked`는 TypeScript 타입 정보를 활용하여
   * Promise 오용, 잘못된 타입 연산 등 일반적인 정적 분석만으로
   * 발견하기 어려운 문제까지 검사합니다.
   *
   * `projectService: true`를 설정하면 typescript-eslint가
   * 프로젝트의 tsconfig.json을 기준으로 타입 정보를 불러옵니다.
   */
  {
    files: ['**/*.{ts,mts}'],

    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },

      globals: {
        ...globals.node,
      },
    },
  },

  /**
   * --------------------------------------------------------------------
   * 5. TypeScript CommonJS 설정
   * --------------------------------------------------------------------
   *
   * `.cts` 파일은 TypeScript 기반 CommonJS 모듈로 해석합니다.
   */
  {
    files: ['**/*.cts'],

    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',

      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },

      globals: {
        ...globals.node,
      },
    },
  },

  /**
   * --------------------------------------------------------------------
   * 6. JSON 및 JSONC 파일 설정
   * --------------------------------------------------------------------
   *
   * JSON 계열 파일은 JavaScript나 TypeScript가 아니므로
   * @eslint/json에서 제공하는 전용 language를 사용합니다.
   *
   * `json/recommended` 설정을 통해 중복 키, 빈 키,
   * 안전하지 않은 값 등의 문제를 검사합니다.
   *
   * 일반 JSON 파일에는 json/json을 적용합니다. 주석을 허용하는
   * tsconfig 계열 파일에는 json/jsonc를 별도로 적용합니다.
   *
   * package-lock.json은 npm이 자동으로 생성하고 관리하므로 제외합니다.
   */
  {
    files: ['**/*.json'],
    ignores: ['**/package-lock.json', '**/tsconfig*.json'],

    plugins: {
      json,
    },

    language: 'json/json',

    extends: ['json/recommended'],
  },
  {
    files: ['**/tsconfig*.json'],

    plugins: {
      json,
    },

    language: 'json/jsonc',

    extends: ['json/recommended'],
  },

  /**
   * --------------------------------------------------------------------
   * 7. Prettier와 ESLint 규칙 충돌 방지
   * --------------------------------------------------------------------
   *
   * eslint-config-prettier는 Prettier와 충돌할 수 있는
   * ESLint의 포맷 관련 규칙을 비활성화합니다.
   *
   * 앞에서 적용된 설정을 최종적으로 덮어쓸 수 있도록
   * 설정 배열의 마지막에 배치합니다.
   *
   * 실제 코드 포맷팅은 Prettier가 담당하며,
   * eslint-config-prettier는 코드를 직접 포맷팅하지 않습니다.
   */
  eslintConfigPrettier,
]);
