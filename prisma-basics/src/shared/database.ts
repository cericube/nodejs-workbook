import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../../generated/prisma/client';

// 현재 파일 위치(import.meta.url)를 기준으로
// 두 단계 위에 있는 .env 파일을 찾아 환경 변수를 불러옵니다.
dotenv.config({ path: new URL('../../.env', import.meta.url) });

// NODE_ENV 값이 'development'이면 개발 환경으로 판단합니다.
// 개발 환경에서는 쿼리 로그를 더 자세히 출력하고 Prisma Client를 재사용합니다.
const isDev = process.env.NODE_ENV === 'development';

// globalThis 객체에 prisma라는 값을 저장할 수 있도록
// TypeScript에 전역 변수의 타입을 알려 줍니다.
//
// 개발 중 파일이 다시 로드될 때마다 PrismaClient가 새로 생성되는 것을
// 방지하기 위해 기존 Client를 전역 객체에 저장합니다.
declare global {
  var prisma: PrismaClient | undefined;
}

// PostgreSQL에 연결된 새로운 Prisma Client를 생성하는 함수입니다.
function getPrismaClient(): PrismaClient {
  // .env 파일에서 DATABASE_URL 값을 읽습니다.
  const connectionString = process.env.DATABASE_URL;

  // 데이터베이스 주소가 없으면 연결할 수 없으므로
  // 프로그램 실행을 중단하고 원인을 알 수 있는 오류를 발생시킵니다.
  if (!connectionString) {
    throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  }

  // Prisma가 PostgreSQL에 연결할 때 사용할 어댑터를 생성합니다.
  // schema 옵션을 'study'로 설정했으므로 study 스키마를 사용합니다.
  const adapter = new PrismaPg({ connectionString }, { schema: 'study' });

  // PostgreSQL 어댑터를 전달하여 Prisma Client를 생성합니다.
  return new PrismaClient({
    adapter,

    // 개발 환경에서는 실행된 SQL과 각종 정보를 자세히 출력합니다.
    // 운영 환경에서는 오류 메시지만 출력합니다.
    log: isDev ? ['query', 'info', 'warn', 'error'] : ['error'],
  });
}

// globalThis에 기존 Prisma Client가 저장되어 있으면 그것을 재사용합니다.
// 저장된 Client가 없으면 getPrismaClient()를 호출해 새로 생성합니다.
export const prisma = globalThis.prisma ?? getPrismaClient();

// 개발 환경에서는 새로 만든 Prisma Client를 전역 객체에 저장합니다.
// 이렇게 하면 개발 서버가 코드를 다시 불러와도 동일한 Client를 재사용할 수 있습니다.
if (isDev) {
  globalThis.prisma = prisma;
}

// shutdown 함수가 중복 실행되는 것을 막기 위한 상태값입니다.
let shuttingDown = false;

// 프로그램이 종료될 때 데이터베이스 연결을 안전하게 정리하는 함수입니다.
const shutdown = async (): Promise<void> => {
  // 이미 종료 처리가 시작되었다면 다시 실행하지 않습니다.
  if (shuttingDown) return;

  // 종료 처리가 시작되었음을 기록합니다.
  shuttingDown = true;

  try {
    // Prisma가 사용 중인 데이터베이스 연결을 종료합니다.
    await prisma.$disconnect();

    // 정상적으로 연결을 종료했으므로 성공 코드 0으로 프로세스를 끝냅니다.
    process.exit(0);
  } catch (error) {
    // 연결 종료 중 문제가 발생하면 오류 내용을 출력합니다.
    console.error('데이터베이스 연결 종료에 실패했습니다.', error);

    // 오류가 발생했음을 나타내는 코드 1로 프로세스를 끝냅니다.
    process.exit(1);
  }
};

// Ctrl+C를 누르면 SIGINT 신호가 발생합니다.
// 이 신호를 한 번만 처리하고 shutdown 함수를 실행합니다.
process.once('SIGINT', () => {
  // shutdown은 Promise를 반환하지만 이벤트 콜백에서는 기다릴 수 없으므로
  // void를 사용해 의도적으로 반환값을 사용하지 않음을 표시합니다.
  void shutdown();
});

// 운영체제나 컨테이너가 프로그램 종료를 요청하면 SIGTERM 신호가 발생합니다.
// 이 신호를 한 번만 처리하고 shutdown 함수를 실행합니다.
process.once('SIGTERM', () => {
  void shutdown();
});
