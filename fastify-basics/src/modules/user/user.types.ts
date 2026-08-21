// Prisma나 HTTP 계층에 직접 의존하지 않는 애플리케이션 공통 사용자 상태 값입니다.
export const UserStatus = {
  // 정상적으로 서비스를 이용할 수 있는 상태입니다.
  ACTIVE: 'ACTIVE',
  // 일시적으로 이용이 제한된 상태입니다.
  SUSPENDED: 'SUSPENDED',
  // 탈퇴 처리가 완료된 상태입니다.
  WITHDRAWN: 'WITHDRAWN',
  // `as const`는 속성을 읽기 전용으로 만들고 각 값을 일반 string이 아닌 리터럴 타입으로 유지합니다.
} as const;

// 위 객체의 값들로 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN' 유니온 타입을 생성합니다.
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// Service가 반환하는 사용자 조회 결과입니다.
// HTTP 응답 형식과 분리하기 위해 생성 일시는 Date 객체로 유지합니다.
export interface UserResult {
  // 데이터베이스의 사용자 기본 키입니다.
  id: number;
  // 로그인과 사용자 식별에 사용하는 이메일입니다.
  email: string;
  // 표시 이름을 등록하지 않은 사용자는 null입니다.
  displayName: string | null;
  // 위에서 정의한 값만 사용자 상태로 허용합니다.
  status: UserStatus;
  // Controller에서 ISO 문자열로 변환하기 전의 생성 시각입니다.
  createdAt: Date;
}
