import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // Prisma CLI가 사용할 스키마 파일의 경로입니다.
  schema: 'prisma/schema.prisma',

  // 마이그레이션 파일들이 저장될 경로를 지정합니다.
  // migrate dev 실행 시 생성되는 SQL/메타 파일들이 이 폴더에 쌓입니다.
  migrations: {
    path: 'prisma/migrations',
  },
  // Prisma CLI가 DB에 연결할 때 사용할 연결 문자열을 어디서 가져올지입니다.

  // exactOptionalPropertyTypes: true에서는 다음 두 상태를 구분합니다.
  // {}                      url을 전달하지 않음: 허용
  // { url: 'postgres...' }  string 전달: 허용
  // { url: undefined }      undefined를 명시적으로 전달: 오류
  // exactOptionalPropertyTypes를 끄기보다는 Prisma의 env()를 사용하는 것이 가장 적절합니다.

  datasource: {
    url: env('DATABASE_URL'),
  },
});
