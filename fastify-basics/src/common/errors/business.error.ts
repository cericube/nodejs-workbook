// src/common/errors/business.error.ts

import { ErrorCode } from './error.codes';

/**
 * 애플리케이션에서 예상할 수 있는 비즈니스 오류를 나타냅니다.
 *
 * 서비스 계층에서는 이 오류를 던져 실패 이유를 전달하고,
 * 전역 오류 처리기는 이를 클라이언트용 HTTP 응답으로 변환합니다.
 * `T`는 오류에 첨부할 상세 정보(`details`)의 타입입니다.
 */
export class BusinessError<T = unknown> extends Error {
  constructor(
    // 클라이언트와 서버가 오류 종류를 구분할 때 사용하는 고정 코드
    public readonly errorCode: ErrorCode,
    // 사람이 읽을 수 있는 오류 설명(Error의 message로 저장됨)
    message: string,
    // HTTP 응답 상태 코드. 지정하지 않으면 잘못된 요청(400)으로 처리
    public readonly statusCode: number = 400,
    // 필드별 검증 결과처럼 오류와 함께 전달할 선택적 부가 정보
    public readonly details?: T,
  ) {
    // Error의 message와 stack을 초기화합니다.
    super(message);

    // 하위 클래스가 상속해도 실제 클래스 이름이 오류 이름으로 기록됩니다.
    this.name = new.target.name;
  }
}
