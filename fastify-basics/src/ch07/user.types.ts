// Prisma의 UserStatus 열거형과 HTTP 스키마가 공유할 수 있는 런타임 상태 값입니다.
// as const를 사용하면 각 값이 일반 string이 아닌 문자열 리터럴로 유지됩니다.
export const UserStatus = {
  // 정상적으로 서비스를 이용할 수 있는 계정입니다.
  ACTIVE: 'ACTIVE',
  // 운영 정책 등에 따라 일시적으로 이용이 제한된 계정입니다.
  SUSPENDED: 'SUSPENDED',
  // 탈퇴 처리가 완료된 계정입니다.
  WITHDRAWN: 'WITHDRAWN',
} as const;

// 객체 값들로 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN' 유니온 타입을 만듭니다.
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
