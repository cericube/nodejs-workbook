// 애플리케이션 생성과 포트 바인딩을 분리하면 같은 구성을 운영 서버와 테스트에서 재사용할 수 있습니다.
import Fastify from 'fastify';

// 서버 인스턴스를 생성하는 팩토리 함수
// 테스트와 실제 서버 실행에서 동일한 앱 구성을 재사용하기 위해
// app을 직접 export하지 않고 함수로 감싸는 패턴을 사용한다.
export function buildApp() {
  // Fastify 서버 인스턴스 생성
  // 이 시점에는 아직 포트를 열지 않고, 라우트와 플러그인만 등록하는 단계
  const app = Fastify();

  // GET /health 엔드포인트 등록
  // 서버 헬스체크, 로드밸런서 체크, 테스트 기본 예제로 가장 많이 쓰인다.
  app.get('/health', () => {
    // Fastify는 return 값을 자동으로 JSON 응답으로 직렬화하여 전송한다.
    // res.send()를 직접 호출하지 않아도 된다.
    return { ok: true };
  });

  // 구성된 Fastify 인스턴스를 반환
  // ▶ production 서버: buildApp().listen(...)
  // ▶ 테스트 코드: buildApp().inject(...)
  // 동일한 앱 설정을 두 환경에서 공유할 수 있다.
  return app;
}
