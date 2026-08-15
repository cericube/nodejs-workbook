// Node.js 환경에서 요청을 가로챌 MSW 서버 생성 함수를 가져옵니다.
import { setupServer } from 'msw/node';
import { userHandlers } from './6-2-1.example.handlers';

// 실제 포트를 열지 않고 등록된 핸들러와 일치하는 요청에 응답합니다.
export const server = setupServer(...userHandlers);
