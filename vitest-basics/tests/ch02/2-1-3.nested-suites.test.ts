// 테스트 대상은 src/ch02의 실제 구현이며, 상대 경로는 현재 테스트 파일 기준입니다.
import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '../../src/ch02/UserService';

// [테스트 스위트] UserService 클래스에 대한 테스트 시작
describe('UserService', () => {
  let service: UserService;

  // 각 테스트('it')가 실행되기 전에 항상 실행되는 설정 작업
  beforeEach(() => {
    // 인메모리 Map을 공유하지 않도록 매 테스트마다 새 인스턴스를 만듭니다.
    service = new UserService();
  });

  // [중첩 그룹] 사용자 생성 기능 관련 테스트
  describe('사용자 생성', () => {
    // [소그룹] 정상적인 상황(Happy Path) 테스트
    describe('유효한 입력', () => {
      it('이메일과 이름으로 사용자를 생성한다', () => {
        // Given (준비) & When (실행)
        const user = service.createUser('test@example.com', 'John');

        // Then (검증): 입력한 값이 객체에 잘 들어갔는지 확인
        expect(user.email).toBe('test@example.com');
        expect(user.name).toBe('John');
      });

      it('생성된 사용자에 ID가 자동 할당된다', () => {
        const user = service.createUser('test@example.com', 'John');

        // Then: ID가 존재하고 문자열 타입인지 확인
        expect(user.id).toBeDefined();
        expect(typeof user.id).toBe('string');
      });
    });

    // [소그룹] 예외 상황(Edge Case) 테스트
    describe('유효하지 않은 입력', () => {
      it('잘못된 이메일 형식은 에러를 발생시킨다', () => {
        // Then: 잘못된 이메일을 넣었을 때 특정 메시지의 에러가 던져지는지 확인
        expect(() => {
          service.createUser('invalid-email', 'John');
        }).toThrow('Invalid email format');
      });

      it('빈 이름은 에러를 발생시킨다', () => {
        // Then: 이름이 없을 때 에러 처리가 되는지 확인
        expect(() => {
          service.createUser('test@example.com', '');
        }).toThrow('Name is required');
      });
    });
  });

  // [중첩 그룹] 사용자 조회 기능 관련 테스트
  describe('사용자 조회', () => {
    it('ID로 사용자를 찾는다', () => {
      // Given: 먼저 사용자를 하나 생성함
      const user = service.createUser('test@example.com', 'John');

      // When: 생성된 ID로 조회 시도
      const found = service.findById(user.id);

      // Then: 객체의 프로퍼티 값을 깊은 비교합니다. 동일 참조 여부는 toBe로 검사합니다.
      expect(found).toEqual(user);
    });

    it('존재하지 않는 ID는 null을 반환한다', () => {
      // When: 가짜 ID로 조회 시도
      const found = service.findById('non-existent-id');

      // Then: 결과가 null인지 확인
      expect(found).toBeNull();
    });
  });
});
