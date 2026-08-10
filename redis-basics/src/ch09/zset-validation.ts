/**
 * Redis Sorted Set에 저장할 score가 유한한 숫자인지 확인합니다.
 *
 * JavaScript의 number에는 NaN과 양·음의 Infinity도 포함됩니다. 이런 값이
 * 랭킹 순서를 깨뜨리거나 Redis 명령 오류를 만들지 않도록 명령 실행 전에 차단합니다.
 *
 * @param score 검사할 Sorted Set score입니다.
 * @param name 오류 메시지에서 score의 용도를 설명할 이름입니다.
 * @throws score가 유한한 숫자가 아니면 오류를 발생시킵니다.
 */
export function assertFiniteScore(score: number, name: string): void {
  if (!Number.isFinite(score)) {
    throw new Error(`${name}는 유한한 숫자여야 합니다.`);
  }
}

/**
 * TOP N 조회에 사용할 limit이 양의 정수인지 확인합니다.
 *
 * ZRANGE의 stop 인덱스는 음수를 허용하며 -1은 마지막 member를 뜻합니다.
 * 따라서 limit이 0일 때 `limit - 1`을 그대로 전달하면 전체 데이터가 조회되므로
 * Redis 명령을 실행하기 전에 별도로 검증합니다.
 */
export function isValidLimit(limit: number): boolean {
  return Number.isInteger(limit) && limit > 0;
}
