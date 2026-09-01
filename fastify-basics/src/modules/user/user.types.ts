/**
 * 사용자 도메인의 여러 계층에서 공유하는 값, 타입과 인터페이스를 정의합니다.
 * Prisma와 HTTP에 직접 의존하지 않고 서비스와 저장소 사이에서 주고받을 데이터를 표현합니다.
 */

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

// 애플리케이션 계층에서 사용할 사용자 권한 값입니다.
export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// 서비스가 반환하는 사용자 조회 결과입니다.
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
  // 인증과 API 권한 검사에 사용하는 사용자 역할입니다.
  role: UserRole;
  // 컨트롤러에서 ISO 문자열로 변환하기 전의 생성 시각입니다.
  createdAt: Date;
  // 마지막 사용자 정보 변경 시각입니다.
  updatedAt: Date;
  // 탈퇴하지 않은 사용자는 null이고, 탈퇴한 사용자는 처리 시각을 가집니다.
  withdrawnAt: Date | null;
}

export interface CreateUserData {
  // 서비스에서 앞뒤 공백을 제거하고 소문자로 변환한 이메일입니다.
  email: string;
  // PasswordHasher가 생성한 값이며 원문 비밀번호가 아닙니다.
  passwordHash: string;
  // undefined이면 Prisma의 기본 동작을 따르고, null이면 표시 이름이 없는 것으로 저장합니다.
  displayName?: string | null;
}
