# Prisma Basics

TypeScript와 PostgreSQL을 사용해 Prisma ORM의 핵심 기능을 단계별로 학습하는 예제 프로젝트입니다. 단순 CRUD부터 관계 쿼리, Raw SQL, 트랜잭션, 오류 처리까지 실제 데이터베이스를 사용하는 코드와 통합 테스트로 구성되어 있습니다.

## 주요 기술

- Node.js 22.13 이상
- TypeScript 6
- Prisma 7
- PostgreSQL
- Vitest 4
- Prisma PostgreSQL 드라이버 어댑터

## 학습 내용

| 디렉터리 | 내용 |
| --- | --- |
| `src/ch01` | Prisma Client를 이용한 첫 데이터 생성 |
| `src/ch03` | 생성, 조회, 수정, 삭제, Upsert |
| `src/ch04` | 필터, 페이지네이션, 관계 생성 및 조회 |
| `src/ch05` | 관계 로딩과 중첩 관계 쿼리 |
| `src/ch06` | Raw SQL, 동적 쿼리 조합, Keyset 페이지네이션 |
| `src/ch07` | Batch·Interactive 트랜잭션, 격리 수준, Nested Write |
| `src/ch08` | Prisma 오류 분류, 변환 및 계층별 오류 처리 |

## 프로젝트 구조

```text
prisma-basics/
├── generated/prisma/       # Prisma가 생성한 Client 코드
├── prisma/
│   ├── migrations/         # 데이터베이스 마이그레이션 이력
│   └── schema.prisma       # Prisma 모델과 관계 정의
├── src/
│   ├── ch01/               # 챕터별 실행 예제
│   ├── ch03~ch08/
│   └── shared/database.ts  # PostgreSQL 어댑터와 Prisma Client 설정
├── tests/                  # 실제 PostgreSQL을 사용하는 통합 테스트
├── prisma.config.ts        # Prisma CLI 설정
├── tsconfig.json           # TypeScript 설정
└── vitest.config.ts        # Vitest 실행 설정
```

## 시작하기

### 1. 의존성 설치

이 프로젝트는 저장소 루트의 npm workspace에 포함되어 있습니다. 저장소 루트에서 의존성을 설치합니다.

```bash
npm install
```

이후 명령은 `prisma-basics` 디렉터리에서 실행합니다.

```bash
cd prisma-basics
```

### 2. PostgreSQL 준비

접속 가능한 PostgreSQL 데이터베이스를 준비하고 프로젝트 루트에 `.env` 파일을 생성합니다.

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/prisma_basics?schema=study"
APP_ENV="development"
PRISMA_QUERY_LOG=false
```

환경 변수의 역할은 다음과 같습니다.

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열 |
| `APP_ENV` | 아니요 | `development`이면 개발 중 Prisma Client를 재사용 |
| `PRISMA_QUERY_LOG` | 아니요 | `true`이면 실행 SQL과 Prisma 로그 출력 |

`src/shared/database.ts`가 PostgreSQL의 `study` 스키마를 사용하므로 `DATABASE_URL`의 `schema`도 `study`로 맞춰야 합니다. 학습용 테스트가 실제 데이터를 생성하고 삭제하므로 운영 DB가 아닌 별도의 로컬 DB 또는 전용 스키마를 사용하세요.

### 3. 데이터베이스 및 Prisma Client 준비

```bash
npx prisma migrate dev
npx prisma generate
```

- `prisma migrate dev`: `prisma/migrations`의 변경 사항을 데이터베이스에 적용합니다.
- `prisma generate`: `generated/prisma`에 타입 안전한 Prisma Client를 생성합니다.

### 4. 첫 예제 실행

```bash
npx tsx src/ch01/index.ts
```

실행하면 User와 연결된 Post가 하나의 Nested Write로 생성되고 결과가 콘솔에 출력됩니다.

## 테스트

전체 테스트를 실행합니다.

```bash
npm test
```

특정 테스트 파일만 실행할 수도 있습니다.

```bash
npx vitest run tests/ch03/create-examples.test.ts
```

모든 테스트는 실제 PostgreSQL을 사용하는 통합 테스트입니다. 같은 데이터베이스를 공유하기 때문에 `vitest.config.ts`에서 테스트 파일을 순차 실행하도록 설정되어 있습니다.

## 타입 검사

```bash
npm run typecheck
```

## 자주 사용하는 Prisma 명령

```bash
# 스키마 변경 후 마이그레이션 생성 및 적용
npx prisma migrate dev --name <migration-name>

# Prisma Client 다시 생성
npx prisma generate

# 현재 스키마를 시각적으로 확인하고 데이터 편집
npx prisma studio

# Prisma 스키마 문법 및 구성 검증
npx prisma validate
```

## 모델 관계

- `User` 1:N `Post`
- `User` N:M `Post` 관계를 명시적 중간 모델인 `PostLike`로 표현
- `User`가 삭제되면 연결된 `Post`와 `PostLike`가 Cascade로 삭제
- `Post`의 `createdAt`, `id` 복합 고유 키를 Keyset 페이지네이션 커서로 사용

## 주의 사항

- `.env`에는 데이터베이스 인증 정보가 포함되므로 Git에 커밋하지 않습니다.
- `generated/prisma`는 직접 수정하지 않고 `prisma generate`로 다시 생성합니다.
- 테스트 도중 강제 종료하면 테스트 데이터가 남을 수 있습니다.
- 스키마를 수정한 뒤에는 마이그레이션과 Prisma Client 생성을 모두 수행합니다.
