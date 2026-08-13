import { describe, it, expect } from 'vitest';

describe('객체 부분 매칭 및 속성 검증', () => {
  const userResponse = {
    id: 1,
    name: 'Gemini',
    email: 'ai@google.com',
    settings: {
      theme: 'dark',
      notifications: true,
    },
    lastLogin: new Date().toISOString(), // 매번 변하는 값
  };

  it('toMatchObject: 중요한 필드만 골라서 검증', () => {
    // 명시하지 않은 lastLogin과 id는 비교 대상에서 제외됩니다.
    expect(userResponse).toMatchObject({
      name: 'Gemini',
      email: 'ai@google.com',
    });

    // 중첩된 객체의 일부도 검증 가능
    expect(userResponse).toMatchObject({
      settings: { theme: 'dark' },
    });
  });

  it('toHaveProperty: 특정 속성의 존재와 값을 확인', () => {
    // 1. 단순히 속성이 존재하는지 확인
    expect(userResponse).toHaveProperty('id');

    // 2. 중첩된 경로의 값을 확인 (Dot notation 사용)
    expect(userResponse).toHaveProperty('settings.theme', 'dark');

    // 3. expect.any(String)은 문자열의 구체적인 값 대신 타입만 확인합니다.
    expect(userResponse).toHaveProperty('lastLogin', expect.any(String));
  });
});
