export interface User {
  id: string;
  email: string;
  name: string;
}

export class UserService {
  // 학습 예제를 단순하게 유지하기 위한 인메모리 저장소입니다.
  // 프로세스가 종료되거나 UserService 인스턴스를 새로 만들면 데이터가 사라집니다.
  private users: Map<string, User> = new Map();

  /**
   * 새로운 사용자를 생성합니다.
   * @param email 사용자 이메일
   * @param name 사용자 이름
   * @throws Error 잘못된 이메일 형식이나 이름이 비어있을 경우
   */
  createUser(email: string, name: string): User {
    // 1. 유효성 검사: 이름 (Name is required)
    if (!name || name.trim() === '') {
      throw new Error('Name is required');
    }

    // 2. 유효성 검사: 이메일의 기본 형태만 확인합니다.
    // 실제 서비스에서는 이 정규식만으로 이메일의 존재 여부까지 보장할 수 없습니다.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // 3. 사용자 객체 생성 및 ID 할당
    // Math.random 기반 ID는 충돌 가능성이 있으므로 학습용으로만 사용합니다.
    const newUser: User = {
      id: Math.random().toString(36).substring(2, 11),
      email,
      name,
    };

    // 4. 저장소(Map)에 저장
    this.users.set(newUser.id, newUser);

    return newUser;
  }

  /**
   * ID로 사용자를 조회합니다.
   * @param id 사용자 ID
   * @returns User 객체 또는 null
   */
  findById(id: string): User | null {
    // Map#get은 키가 없으면 undefined를 반환하므로 공개 API에서는 null로 통일합니다.
    return this.users.get(id) || null;
  }
}
