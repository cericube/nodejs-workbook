import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  InternalServerError,
} from '../../src/ch04/4-4-1.app-errors';

describe('Error Classes - 에러 클래스 단위 테스트', () => {
  describe('ValidationError', () => {
    it('400 상태 코드를 설정합니다', () => {
      const error = new ValidationError('유효하지 않은 입력');
      expect(error.statusCode).toBe(400);
    });

    it('VALIDATION_ERROR 코드를 설정합니다', () => {
      const error = new ValidationError('유효하지 않은 입력');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('세부 정보를 포함할 수 있습니다', () => {
      const error = new ValidationError('유효하지 않은 입력', {
        field: 'email',
        constraint: 'must be valid email',
      });

      expect(error.details).toMatchObject({
        field: 'email',
        constraint: 'must be valid email',
      });
    });
  });

  describe('NotFoundError', () => {
    it('404 상태 코드를 설정합니다', () => {
      const error = new NotFoundError('사용자');
      expect(error.statusCode).toBe(404);
    });

    it('리소스명을 메시지에 포함합니다', () => {
      const error = new NotFoundError('주문');
      expect(error.message).toContain('주문');
    });

    it('ID를 메시지에 포함할 수 있습니다', () => {
      const error = new NotFoundError('사용자', '123');
      expect(error.message).toContain('123');
      expect(error.details).toMatchObject({ id: '123' });
    });
  });

  describe('ConflictError', () => {
    it('409 상태 코드를 설정합니다', () => {
      const error = new ConflictError('중복된 리소스');
      expect(error.statusCode).toBe(409);
    });

    it('커스텀 메시지를 설정합니다', () => {
      const message = '이미 존재하는 이메일입니다';
      const error = new ConflictError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('UnauthorizedError', () => {
    it('401 상태 코드를 설정합니다', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
    });

    it('기본 메시지를 제공합니다', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('인증이 필요합니다');
    });

    it('커스텀 메시지를 설정할 수 있습니다', () => {
      const error = new UnauthorizedError('토큰이 만료되었습니다');
      expect(error.message).toBe('토큰이 만료되었습니다');
    });
  });

  describe('ForbiddenError', () => {
    it('403 상태 코드를 설정합니다', () => {
      const error = new ForbiddenError();
      expect(error.statusCode).toBe(403);
    });
  });

  describe('InternalServerError', () => {
    it('500 상태 코드를 설정합니다', () => {
      const error = new InternalServerError();
      expect(error.statusCode).toBe(500);
    });

    it('기본 메시지를 제공합니다', () => {
      const error = new InternalServerError();
      expect(error.message).toBe('서버 오류가 발생했습니다');
    });
  });

  describe('AppError 기본 클래스', () => {
    it('모든 에러 클래스의 부모입니다', () => {
      const errors = [
        new ValidationError('test'),
        new NotFoundError('test'),
        new ConflictError('test'),
        new UnauthorizedError(),
        new ForbiddenError(),
        new InternalServerError(),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(Error);
      });
    });

    it('스택 트레이스를 포함합니다', () => {
      const error = new ValidationError('test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });
});
