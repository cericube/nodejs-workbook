/**
 * TypeScript 초보자를 위한 할 일 목록 예제
 *
 * 이 파일은 간단한 할 일 목록을 만들면서 다음 문법을 학습합니다.
 *
 * - 리터럴 타입, interface, type, 유니온과 배열
 * - 선택적 속성, null, unknown과 타입 좁히기
 * - 구조분해, Rest, Spread와 Optional Chaining
 * - 함수 타입, 기본 매개변수, 선택적 매개변수와 오버로딩
 * - 클래스, 접근 제어자, Getter/Setter, implements와 상속
 * - 제네릭, keyof, Partial, Pick, Omit, Record와 satisfies
 * - Promise, async/await, all, race와 allSettled
 * - export, default export와 import type
 */

// =============================================================================
// 1단계: 데이터의 모양을 타입으로 정의합니다.
// =============================================================================

/**
 * 리터럴 타입은 허용할 문자열을 미리 정합니다.
 * TodoStatus에는 "todo"와 "done"만 넣을 수 있습니다.
 * "doen"처럼 잘못 입력하면 TypeScript가 컴파일 오류를 알려 줍니다.
 */
export type TodoStatus = 'todo' | 'done';
export type TodoPriority = 'low' | 'normal' | 'high';

/**
 * interface는 객체가 어떤 속성을 가져야 하는지 설명합니다.
 * nickname 뒤의 ?는 선택적 속성이라는 뜻입니다.
 * 따라서 nickname은 문자열이거나 속성 자체가 없을 수 있습니다.
 */
export interface User {
  id: number;
  name: string;
  nickname?: string;
}

/**
 * Todo는 할 일 한 개의 모양을 나타냅니다.
 * owner는 User 또는 null입니다.
 * null은 담당자가 아직 정해지지 않았다는 상태를 명시적으로 표현합니다.
 */
export interface Todo {
  id: number;
  title: string;
  status: TodoStatus;
  priority: TodoPriority;
  owner: User | null;
  tags: string[];
  createdAt: Date;
}

/**
 * 튜플은 각 위치의 의미와 타입이 정해진 배열입니다.
 * 첫 번째 숫자는 전체 개수이고 두 번째 숫자는 완료 개수입니다.
 */
type TodoStatistics = [total: number, completed: number];

// =============================================================================
// 2단계: 원본 타입에서 목적에 맞는 새로운 타입을 만듭니다.
// =============================================================================

/**
 * Omit은 원본 타입에서 지정한 속성을 제외합니다.
 * 새 할 일을 만들 때 id와 createdAt은 TodoManager가 자동으로 만듭니다.
 * 사용자는 나머지 속성만 전달하면 됩니다.
 */
export type NewTodo = Omit<Todo, 'id' | 'createdAt'>;

/**
 * Pick은 필요한 속성만 선택합니다.
 * 목록 화면에는 모든 정보가 필요하지 않으므로 네 속성만 사용합니다.
 */
export type TodoSummary = Pick<Todo, 'id' | 'title' | 'status' | 'priority'>;

/**
 * Partial은 모든 속성을 선택적으로 만듭니다.
 * 먼저 Pick으로 수정 가능한 속성만 고른 뒤 Partial을 적용합니다.
 * 따라서 제목만 수정하거나 상태만 수정할 수 있습니다.
 */
export type TodoUpdate = Partial<Pick<Todo, 'title' | 'status' | 'priority' | 'owner' | 'tags'>>;

/**
 * Record는 키와 값의 타입이 정해진 객체를 만듭니다.
 * satisfies는 todo와 done 키가 모두 있는지 검사합니다.
 * as const는 "할 일"과 "완료"를 구체적인 리터럴 타입으로 보존합니다.
 */
const statusLabels = {
  todo: '할 일',
  done: '완료',
} as const satisfies Record<TodoStatus, string>;

/** 자주 사용하는 유틸리티 타입을 간단한 할 일 타입에 적용합니다. */
type ReadonlyTodo = Readonly<Todo>;
type UnfinishedStatus = Exclude<TodoStatus, 'done'>;
type FinishedStatus = Extract<TodoStatus, 'done'>;
type AssignedOwner = NonNullable<Todo['owner']>;

// =============================================================================
// 3단계: 작은 함수로 값을 변환하고 검사합니다.
// =============================================================================

/**
 * 함수 타입은 매개변수와 반환 타입을 한 번에 표현합니다.
 * TodoFilter는 Todo를 받아 조건 만족 여부를 boolean으로 반환합니다.
 */
type TodoFilter = (todo: Todo) => boolean;

/**
 * 화살표 함수가 객체를 바로 반환할 때는 객체를 괄호로 감쌉니다.
 * map()에서 Todo를 TodoSummary로 바꿀 때 사용합니다.
 */
const toSummary = (todo: Todo): TodoSummary => ({
  id: todo.id,
  title: todo.title,
  status: todo.status,
  priority: todo.priority,
});

/**
 * prefix에는 기본값을 지정했습니다.
 * suffix 뒤의 ?는 호출할 때 생략할 수 있다는 뜻입니다.
 */
function formatTitle(title: string, prefix: string = '[할 일]', suffix?: string): string {
  const suffixText = suffix ? ` ${suffix}` : '';
  return `${prefix} ${title}${suffixText}`;
}

/** Rest 매개변수는 여러 문자열을 하나의 배열로 모읍니다. */
function joinTags(...tags: string[]): string {
  return tags.join(', ');
}

/**
 * 함수 오버로딩은 입력할 수 있는 타입을 여러 개 선언합니다.
 * 마지막 구현부는 모든 입력 타입을 처리해야 합니다.
 */
function formatValue(value: Date): string;
function formatValue(value: number): string;
function formatValue(value: string): string;
function formatValue(value: Date | number | string): string {
  if (value instanceof Date) {
    return value.toLocaleDateString('ko-KR');
  }

  if (typeof value === 'number') {
    return value.toLocaleString('ko-KR');
  }

  return value.trim();
}

/**
 * 제네릭은 전달한 객체의 구체적인 타입 정보를 유지합니다.
 * Key extends keyof ObjectType은 실제로 존재하는 키만 허용합니다.
 */
function getProperty<ObjectType, Key extends keyof ObjectType>(
  object: ObjectType,
  key: Key,
): ObjectType[Key] {
  return object[key];
}

/**
 * 외부에서 받은 값은 타입을 신뢰할 수 없으므로 unknown으로 받습니다.
 * typeof 검사를 통과한 분기에서만 문자열이나 숫자로 사용할 수 있습니다.
 */
function parseTodoId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  throw new TypeError('할 일 ID는 1 이상의 정수여야 합니다.');
}

/**
 * any는 존재하지 않는 메서드도 호출할 수 있게 허용합니다.
 * 아래 함수는 위험을 보여 주기 위한 예시이며 실제로 호출하지 않습니다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- any의 위험을 보여 주는 의도적인 예시입니다. */
function demonstrateAnyRisk(value: any): void {
  value.methodThatDoesNotExist();
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
void demonstrateAnyRisk;

/**
 * never는 정상적으로 도달할 수 없는 분기를 표현합니다.
 * TodoStatus에 새 값을 추가하고 switch를 수정하지 않으면 오류가 발생합니다.
 */
function assertNever(value: never): never {
  throw new Error(`처리하지 않은 상태입니다: ${String(value)}`);
}

function getStatusLabel(status: TodoStatus): string {
  switch (status) {
    case 'todo':
      return statusLabels.todo;
    case 'done':
      return statusLabels.done;
    default:
      return assertNever(status);
  }
}

// =============================================================================
// 4단계: TodoManager 클래스 하나로 할 일 목록을 관리합니다.
// =============================================================================

/** implements로 구현할 간단한 로그 계약입니다. */
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(`[기록] ${message}`);
  }
}

/**
 * TodoManager는 할 일 배열과 다음 ID를 내부에서 관리합니다.
 * 복잡한 저장소 계층 없이 한 클래스에서 추가, 수정과 조회를 처리합니다.
 */
export class TodoManager {
  /** private 속성은 클래스 외부에서 직접 접근할 수 없습니다. */
  private todos: Todo[] = [];
  private nextId = 1;
  private _maxTodos = 100;

  /**
   * 생성자 매개변수에 접근 제어자를 붙이면 필드 선언과 초기화를 한 번에 처리합니다.
   * logger는 외부에 공개하지 않고, listName은 외부에서 읽을 수 있습니다.
   */
  constructor(
    private readonly logger: Logger,
    public readonly listName: string,
  ) {}

  /** Getter는 manager.count처럼 속성을 읽는 문법으로 사용합니다. */
  get count(): number {
    return this.todos.length;
  }

  /** Setter는 값을 저장하기 전에 올바른 값인지 검사합니다. */
  set maxTodos(value: number) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError('최대 할 일 수는 1 이상의 정수여야 합니다.');
    }

    this._maxTodos = value;
  }

  add(input: NewTodo): Todo {
    if (this.count >= this._maxTodos) {
      throw new Error('더 이상 할 일을 추가할 수 없습니다.');
    }

    /** Spread로 입력값과 자동 생성 속성을 합쳐 새로운 Todo를 만듭니다. */
    const todo: Todo = {
      ...input,
      id: this.nextId++,
      createdAt: new Date(),
    };

    this.todos.push(todo);
    this.logger.log(`할 일 #${todo.id}을(를) 추가했습니다.`);
    return todo;
  }

  update(id: number, changes: TodoUpdate): Todo {
    const index = this.todos.findIndex((todo) => todo.id === id);

    if (index < 0) {
      throw new Error(`할 일 #${id}을(를) 찾을 수 없습니다.`);
    }

    const current = this.todos[index];

    /** noUncheckedIndexedAccess를 고려하여 배열 원소의 존재를 확인합니다. */
    if (!current) {
      throw new Error(`할 일 #${id}을(를) 읽을 수 없습니다.`);
    }

    /**
     * 앞의 current를 얕게 복사하고 뒤의 changes로 같은 속성을 덮어씁니다.
     * 원본 객체를 직접 수정하지 않고 새로운 객체를 만드는 방식입니다.
     */
    const updated: Todo = { ...current, ...changes };
    this.todos[index] = updated;
    this.logger.log(`할 일 #${id}을(를) 수정했습니다.`);
    return updated;
  }

  findById(id: number): Todo | undefined {
    return this.todos.find((todo) => todo.id === id);
  }

  /** filter가 없으면 전체 목록을, 있으면 조건에 맞는 목록을 반환합니다. */
  list(filter?: TodoFilter): Todo[] {
    return filter ? this.todos.filter(filter) : [...this.todos];
  }

  summaries(filter?: TodoFilter): TodoSummary[] {
    return this.list(filter).map(toSummary);
  }
}

/**
 * 상속을 간단히 보여 주는 클래스입니다.
 * super.add()로 부모 클래스의 추가 기능을 그대로 재사용합니다.
 */
class StudyTodoManager extends TodoManager {
  addStudy(title: string): Todo {
    return super.add({
      title,
      status: 'todo',
      priority: 'normal',
      owner: null,
      tags: ['study'],
    });
  }
}

// =============================================================================
// 5단계: 서버 응답을 제네릭과 타입 가드로 안전하게 처리합니다.
// =============================================================================

/**
 * T는 성공 응답의 data에 들어갈 타입입니다.
 * success의 true와 false가 두 응답 타입을 구분합니다.
 */
interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: string;
}

type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/** result is ApiSuccess<T>는 사용자 정의 타입 가드입니다. */
function isApiSuccess<T>(result: ApiResult<T>): result is ApiSuccess<T> {
  return result.success;
}

/** Array.isArray와 typeof를 함께 사용하여 unknown 배열을 검사합니다. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// =============================================================================
// 6단계: Promise와 async/await로 비동기 요청을 흉내 냅니다.
// =============================================================================

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** async 함수는 반환값을 Promise로 감싸서 반환합니다. */
async function fetchTodoSeeds(): Promise<ApiResult<NewTodo[]>> {
  await delay(30);

  return {
    success: true,
    data: [
      {
        title: 'TypeScript 예제 읽기',
        status: 'todo',
        priority: 'high',
        owner: null,
        tags: ['typescript', 'study'],
      },
    ],
  };
}

async function fetchCurrentUser(): Promise<User> {
  await delay(20);

  return {
    id: 1,
    name: 'Alice',
  };
}

async function fetchNotice(): Promise<string> {
  await delay(10);
  return '오늘도 할 일을 하나씩 완료해 보세요.';
}

/**
 * Promise.race는 가장 먼저 끝난 Promise의 결과를 반환합니다.
 * 타이머가 먼저 끝나면 시간 초과 오류를 발생시킵니다.
 */
async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  const timeout = delay(milliseconds).then(() => {
    throw new Error(`요청 시간이 ${milliseconds}ms를 초과했습니다.`);
  });

  return Promise.race([promise, timeout]);
}

/** Awaited와 ReturnType으로 비동기 함수의 최종 결과 타입을 구합니다. */
type FetchResult = Awaited<ReturnType<typeof fetchTodoSeeds>>;

// =============================================================================
// 7단계: main 함수에서 모든 기능을 쉬운 순서로 실행합니다.
// =============================================================================

async function main(): Promise<void> {
  const logger = new ConsoleLogger();
  const manager = new StudyTodoManager(logger, '오늘의 할 일');
  manager.maxTodos = 10;

  console.log(`\n=== ${manager.listName} ===`);

  /**
   * Promise.all은 서로 의존하지 않는 요청을 동시에 실행합니다.
   * 두 요청이 모두 성공하면 배열 구조분해로 각 결과를 받습니다.
   */
  const [todoResult, currentUser] = await Promise.all([
    withTimeout(fetchTodoSeeds(), 1_000),
    fetchCurrentUser(),
  ]);

  if (!isApiSuccess(todoResult)) {
    console.error(`할 일 요청 실패: ${todoResult.error}`);
    return;
  }

  /**
   * 객체 구조분해로 name을 userName이라는 변수명으로 바꿉니다.
   * nickname이 undefined이면 "별명 없음"을 기본값으로 사용합니다.
   */
  const { name: userName, nickname = '별명 없음' } = currentUser;
  console.log(`사용자: ${userName}, ${nickname}`);

  const firstSeed = todoResult.data[0];
  if (!firstSeed) {
    throw new Error('추가할 할 일이 없습니다.');
  }

  /** Spread로 서버 입력을 복사하고 현재 사용자를 담당자로 지정합니다. */
  const firstTodo = manager.add({
    ...firstSeed,
    owner: currentUser,
  });

  /** 부모 클래스의 add()를 재사용하는 간단한 상속 예제입니다. */
  manager.addStudy('제네릭 함수 연습하기');

  /**
   * Optional Chaining은 owner가 null이면 name에 접근하지 않습니다.
   * Nullish 병합은 결과가 null 또는 undefined이면 기본값을 사용합니다.
   */
  const ownerName = firstTodo.owner?.name ?? '담당자 없음';
  console.log(`첫 할 일 담당자: ${ownerName}`);

  /** 논리 대입 연산자는 조건을 만족할 때만 값을 대입합니다. */
  let displayName = '';
  displayName ||= userName; // 왼쪽이 Falsy이므로 userName을 대입합니다.

  let cachedTitle: string | undefined = undefined;
  cachedTitle ??= firstTodo.title; // 왼쪽이 undefined이므로 제목을 대입합니다.

  let shouldNotify = true;
  shouldNotify &&= firstTodo.priority === 'high';

  console.log({ displayName, cachedTitle, shouldNotify });

  /** ===는 타입을 변환하지 않고 값과 타입을 비교합니다. */
  console.log('완료됐나요?', firstTodo.status === 'done');

  /** Object.is는 NaN을 자기 자신과 같은 값으로 판단합니다. */
  const invalidNumber = Number('숫자가 아님');
  console.log('NaN인가요?', Object.is(invalidNumber, NaN));

  /** includes는 배열에서 NaN도 찾을 수 있습니다. */
  console.log('NaN이 있나요?', [1, 2, NaN].includes(NaN));

  /** Object.hasOwn은 객체가 직접 가진 속성만 확인합니다. */
  console.log('title 속성이 있나요?', Object.hasOwn(firstTodo, 'title'));

  /** Partial 기반 TodoUpdate 덕분에 status 하나만 전달할 수 있습니다. */
  const completedTodo = manager.update(firstTodo.id, { status: 'done' });

  console.log('상태:', getStatusLabel(completedTodo.status));
  console.log('제목:', formatTitle(completedTodo.title, '[완료]'));
  console.log('태그:', joinTags(...completedTodo.tags));
  console.log('생성일:', formatValue(completedTodo.createdAt));
  console.log('우선순위:', getProperty(completedTodo, 'priority'));

  /** 완료되지 않은 할 일만 필터링하고 요약 객체로 바꿉니다. */
  const unfinished = manager.summaries((todo) => todo.status === 'todo');
  console.log('남은 할 일:', unfinished);

  /** 튜플의 첫 번째 값과 두 번째 값을 구조분해로 꺼냅니다. */
  const allTodos = manager.list();
  const statistics: TodoStatistics = [
    allTodos.length,
    allTodos.filter((todo) => todo.status === 'done').length,
  ];
  const [totalCount, completedCount] = statistics;
  console.log(`전체 ${totalCount}개 / 완료 ${completedCount}개`);

  /** Exclude와 Extract로 만든 타입은 허용 값이 더 좁습니다. */
  const nextStatus: UnfinishedStatus = 'todo';
  const finalStatus: FinishedStatus = 'done';
  console.log({ nextStatus, finalStatus });

  /** null 검사를 통과한 owner는 AssignedOwner 타입으로 사용할 수 있습니다. */
  if (completedTodo.owner) {
    const owner: AssignedOwner = completedTodo.owner;
    console.log('확정된 담당자:', owner.name);
  }

  /** Readonly로 받은 객체는 속성을 다시 할당할 수 없습니다. */
  const readonlyTodo: ReadonlyTodo = completedTodo;
  console.log('읽기 전용 할 일:', readonlyTodo.title);

  /** unknown 배열은 타입 가드로 검사한 뒤 문자열 배열로 사용합니다. */
  const externalTags: unknown = ['typescript', 'beginner'];
  if (isStringArray(externalTags)) {
    console.log(
      '외부 태그:',
      externalTags.map((tag) => tag.toUpperCase()),
    );
  }

  /** 문자열 형태의 외부 ID를 검사하고 숫자로 변환합니다. */
  console.log('검증한 ID:', parseTodoId('1'));

  /**
   * Promise.allSettled는 일부 요청이 실패해도 모든 결과를 기다립니다.
   * fulfilled와 rejected를 구분하여 각각 처리합니다.
   */
  const optionalResults = await Promise.allSettled([
    fetchNotice(),
    Promise.reject(new Error('선택적 날씨 요청에 실패했습니다.')),
  ]);

  optionalResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      console.log('선택 요청 성공:', result.value);
    } else if (result.reason instanceof Error) {
      console.warn('선택 요청 실패:', result.reason.message);
    }
  });
}

/**
 * Promise의 catch 콜백 매개변수를 unknown으로 선언했습니다.
 * Error인지 확인한 뒤에만 message에 접근합니다.
 */
main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error('프로그램 오류:', error.message);
    return;
  }

  console.error('알 수 없는 오류가 발생했습니다.', error);
});

/** FetchResult 타입이 실제로 존재함을 보여 주기 위한 선언입니다. */
const fetchResultExample: FetchResult | null = null;
void fetchResultExample;

/** TodoManager를 Default Export로도 내보냅니다. */
export default TodoManager;

/**
 * 다른 파일에서는 다음처럼 값과 타입을 구분하여 가져올 수 있습니다.
 * 아래 코드는 사용 방법을 설명하는 주석이며 현재 파일에서는 실행되지 않습니다.
 *
 * import TodoManager from "./todo-example.js";
 * import type { Todo, TodoSummary } from "./todo-example.js";
 *
 * import type으로 가져온 선언은 컴파일된 JavaScript에서 제거됩니다.
 * 실제 프로젝트에서는 재사용할 모듈과 main() 실행 파일을 분리하는 것이 좋습니다.
 */
