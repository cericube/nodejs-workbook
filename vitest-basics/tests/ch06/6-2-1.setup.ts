import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './6-2-1.server';

// 이 setup을 불러온 테스트 파일을 실행하기 전에 가로채기를 켭니다.
beforeAll(() => {
  server.listen({
    // 등록되지 않은 요청이 실제 네트워크로 나가지 않게 합니다.
    onUnhandledRequest: 'error',
  });
});

// 테스트에서 server.use()로 추가한 임시 핸들러를 제거합니다.
afterEach(() => {
  server.resetHandlers();
});

// 이 setup을 불러온 테스트 파일의 실행이 끝나면 가로채기를 종료합니다.
afterAll(() => {
  server.close();
});
