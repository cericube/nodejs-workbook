/**
 * Pub/Sub으로 받은 값을 문자열 키를 가진 일반 JSON 객체로 좁힙니다.
 * `null`과 배열은 메시지 객체로 취급하지 않습니다.
 */
export function requireRecord(value: unknown, messageName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${messageName} must be a JSON object`);
  }

  return value as Record<string, unknown>;
}

/**
 * JSON 문자열을 파싱하고 최상위 값이 객체인지 검사합니다.
 * `JSON.parse()` 결과를 바로 도메인 타입으로 단언하지 않아 잘못된 payload의 유입을 막습니다.
 */
export function parseJsonObject(rawMessage: string, messageName: string): Record<string, unknown> {
  const value = JSON.parse(rawMessage) as unknown;
  return requireRecord(value, messageName);
}

/** 필수 문자열 필드를 읽으며 공백으로만 구성된 값도 거부합니다. */
export function requireString(
  value: Record<string, unknown>,
  field: string,
  messageName: string,
): string {
  const fieldValue = value[field];

  if (typeof fieldValue !== 'string' || fieldValue.trim().length === 0) {
    throw new TypeError(`${messageName}.${field} must be a non-empty string`);
  }

  return fieldValue;
}

/**
 * ID 필드를 양의 안전한 정수로 검증합니다.
 * `Number.MAX_SAFE_INTEGER`를 넘는 값은 JSON 숫자의 정밀도를 보장할 수 없으므로 거부합니다.
 */
export function requirePositiveInteger(
  value: Record<string, unknown>,
  field: string,
  messageName: string,
): number {
  const fieldValue = value[field];

  if (!Number.isSafeInteger(fieldValue) || (fieldValue as number) <= 0) {
    throw new TypeError(`${messageName}.${field} must be a positive safe integer`);
  }

  return fieldValue as number;
}

/** 문자열 필드가 지정한 리터럴 목록에 포함되는지 확인하고 해당 union 타입으로 좁힙니다. */
export function requireEnum<const T extends readonly string[]>(
  value: Record<string, unknown>,
  field: string,
  allowedValues: T,
  messageName: string,
): T[number] {
  const fieldValue = value[field];

  if (typeof fieldValue !== 'string' || !allowedValues.includes(fieldValue)) {
    throw new TypeError(`${messageName}.${field} has an unsupported value`);
  }

  return fieldValue;
}

/**
 * `Date#toISOString()`과 동일한 UTC ISO 8601 형식인지 확인합니다.
 * 단순히 파싱 가능한 날짜가 아니라 직렬화 규칙까지 동일한 값만 허용합니다.
 */
export function requireIsoDate(
  value: Record<string, unknown>,
  field: string,
  messageName: string,
): string {
  const fieldValue = requireString(value, field, messageName);
  const date = new Date(fieldValue);

  if (Number.isNaN(date.getTime()) || date.toISOString() !== fieldValue) {
    throw new TypeError(`${messageName}.${field} must be an ISO 8601 UTC date`);
  }

  return fieldValue;
}
