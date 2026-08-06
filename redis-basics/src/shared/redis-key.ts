/**
 * Redis Key 규칙을 한 곳에서 관리하는 유틸리티입니다.
 *
 * 기본 규칙은 다음과 같습니다.
 * - cache:*   : JSON 캐시입니다.
 * - string:*  : Redis String 실습입니다.
 * - hash:*    : Redis Hash 실습입니다.
 * - list:*    : Redis List 실습입니다.
 * - set:*     : Redis Set 실습입니다.
 * - zset:*    : Redis Sorted Set 실습입니다.
 * - stream:*  : Redis Stream 실습입니다.
 * - channel:* : Redis Pub/Sub 실습입니다.
 */
export const RedisKey = {
  cache: {
    user: (userId: number) => `cache:user:${userId}`, // 사용자 단건 조회 캐시입니다.
  },

  string: {
    authCode: (email: string) => `string:auth-code:${email}`, // 이메일 인증 코드입니다.
    rateLimit: (key: string) => `string:rate-limit:${key}`, // 요청 횟수 제한입니다.
    postViewCount: (postId: number) => `string:post-view-count:${postId}`, // 게시글 조회수입니다.
  },

  hash: {
    userProfile: (userId: number) => `hash:user-profile:${userId}`, // 사용자 프로필입니다.
    userSession: (sessionId: string) => `hash:session:${sessionId}`, // 로그인 세션입니다.
    userSetting: (userId: number) => `hash:user-setting:${userId}`, // 사용자 설정입니다.
    productStock: (productId: number) => `hash:product-stock:${productId}`, // 상품 재고입니다.
  },

  list: {
    postRecentViews: (userId: number) => `list:user:${userId}:recent-posts`, // 최근 본 게시글입니다.
    searchRecent: (userId: number) => `list:user:${userId}:recent-searches`, // 최근 검색어입니다.
    simpleJobQueue: () => `list:simple-job-queue`, // 간단한 작업 큐입니다.
    logBuffer: () => `list:log-buffer`, // 최근 로그 버퍼입니다.
  },

  set: {
    postLikes: (postId: number) => `set:post-likes:${postId}`, // 좋아요 사용자 목록입니다.
    dailyVisitors: (date: string) => `set:daily-visitors:${date}`, // 일일 방문자 목록입니다.
    onlineUsers: () => `set:online-users`, // 현재 온라인 사용자 목록입니다.
    duplicateRequest: (requestId: string) => `set:duplicate-request:${requestId}`, // 중복 요청 방지용입니다.
  },

  zset: {
    postRanking: () => `zset:post-ranking`, // 인기 게시글 순위입니다.
    searchRanking: () => `zset:search-ranking`, // 인기 검색어 순위입니다.
    userPointRanking: () => `zset:user-point-ranking`, // 사용자 포인트 순위입니다.
    priorityQueue: () => `zset:priority-queue`, // 우선순위 큐입니다.
  },

  stream: {
    orders: () => `stream:orders`, // 주문 이벤트 Stream입니다.
    notifications: () => `stream:notifications`, // 알림 이벤트 큐입니다.
    emails: () => `stream:emails`, // 이메일 작업 큐입니다.
    auditLogs: () => `stream:audit-logs`, // 감사 로그 Stream입니다.
  },

  channel: {
    notification: () => `channel:notification`, // 실시간 알림 채널입니다.
    cacheInvalidation: () => `channel:cache-invalidation`, // 캐시 무효화 채널입니다.
    chat: (roomId: string) => `channel:chat:${roomId}`, // 채팅방 메시지 채널입니다.
    adminNotice: () => `channel:admin-notice`, // 관리자 공지 채널입니다.
  },
} as const;
