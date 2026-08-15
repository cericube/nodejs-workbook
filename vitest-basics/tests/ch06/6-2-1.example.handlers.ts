import { http, HttpResponse } from 'msw';

// POST /users가 받을 수 있는 JSON 요청 Body의 형태입니다.
// name은 핸들러에서 누락 여부를 검사하기 위해 선택 속성으로 선언합니다.
type CreateUserBody = {
  name?: string;
  role?: string;
};

// 애플리케이션이 호출할 외부 사용자 API의 동작을 핸들러 배열로 표현합니다.
export const userHandlers = [
  // GET 요청의 Query Parameter를 읽어 응답 데이터에 반영합니다.
  http.get('https://api.example.com/users', ({ request }) => {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');

    return HttpResponse.json([{ id: 1, name: 'Alice', role: role ?? 'user' }]);
  }),

  // POST 요청의 JSON Body를 읽고 필수 값을 검증합니다.
  http.post('https://api.example.com/users', async ({ request }) => {
    const newUser = (await request.json()) as CreateUserBody;

    if (!newUser.name) {
      return new HttpResponse(null, { status: 400 });
    }

    // 객체를 펼친 다음 서버 발급 ID를 넣어 요청의 id 값이 응답을 덮어쓰지 못하게 합니다.
    return HttpResponse.json({ ...newUser, id: 2 }, { status: 201 });
  }),
];
