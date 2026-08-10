// src/ch07/post-list.service.ts

import { prisma } from '../shared/prisma.js';
import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';
import type { Prisma } from '../generated/prisma/client';

/**
 * 최근 본 게시글 상세 조회에 필요한 DB 컬럼 목록입니다.
 *
 * Redis List에는 최근 본 순서를 표현할 게시글 ID만 저장합니다.
 * 제목, 내용, 작성자, 상태처럼 변경될 수 있는 원본 데이터는 DB에서 다시 조회합니다.
 */
const RecentPostSelect: Prisma.PostSelect = {
  id: true,
  title: true,
  content: true,
  authorId: true,
  status: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * 최근 본 게시글 API가 반환하는 응답 데이터입니다.
 *
 * DB의 Date 값은 클라이언트가 다루기 쉬운 ISO 문자열로 변환해서 반환합니다.
 */
export type RecentPostOutput = {
  id: number;
  title: string;
  content: string;
  authorId: number;
  status: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Prisma에서 조회한 게시글 데이터를 최근 본 게시글 응답 형태로 변환합니다.
 *
 * 1. DB에서 가져온 필드 값은 그대로 유지합니다.
 * 2. createdAt, updatedAt Date 값은 JSON 응답에 적합한 ISO 문자열로 바꿉니다.
 */
function toRecentPostOutput(post: {
  id: number;
  title: string;
  content: string;
  authorId: number;
  status: string;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}): RecentPostOutput {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    authorId: post.authorId,
    status: post.status,
    viewCount: post.viewCount,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

/** Redis에는 조회 순서를, DB에는 게시글 원본을 두는 최근 본 게시글 예제입니다. */
export class PostListService {
  /**
   * 게시글을 단건 조회하고 최근 본 게시글 목록에 기록합니다.
   *
   * 1. DB에서 postId에 해당하는 게시글을 조회합니다.
   * 2. 게시글이 없으면 최근 본 목록에 기록하지 않고 null을 반환합니다.
   * 3. 게시글이 있으면 addRecentViewedPost를 호출해 Redis List에 조회 기록을 남깁니다.
   * 4. 조회한 게시글을 최근 본 게시글 응답 형태로 변환해 반환합니다.
   *
   * 실습 포인트:
   * 글 조회 흐름에서 최근 본 목록 기록까지 함께 처리하면, 호출하는 쪽은 Redis List 명령을 몰라도 됩니다.
   *
   * 참고:
   * 존재하지 않는 게시글 ID는 최근 본 목록에 남기지 않아야 나중에 잘못된 최근 기록이 쌓이지 않습니다.
   */
  async getPostAndAddRecentViewedPost(
    userId: number,
    postId: number,
    limit = 10,
  ): Promise<RecentPostOutput | null> {
    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      select: RecentPostSelect,
    });

    if (!post) {
      return null;
    }

    await this.addRecentViewedPost(userId, postId, limit);

    return toRecentPostOutput(post);
  }

  /**
   * 사용자가 최근 본 게시글을 Redis List에 기록합니다.
   *
   * 1. 사용자별 최근 본 게시글 List key를 만듭니다.
   * 2. 같은 게시글 ID가 이미 있으면 먼저 제거해서 중복을 방지합니다.
   * 3. 새로 본 게시글 ID를 List 앞쪽에 넣어 최신순을 유지합니다.
   * 4. 지정한 개수만 남기고 오래된 기록은 잘라냅니다.
   *
   * 실습 포인트:
   * Redis List는 입력 순서를 유지하므로 최근 본 글, 최근 검색어처럼 순서가 중요한 기록에 적합합니다.
   *
   * 참고:
   * 게시글 상세 데이터 전체를 Redis에 저장하지 않고 ID만 저장하면 캐시 무효화 부담을 줄일 수 있습니다.
   * LREM, LPUSH, LTRIM은 MULTI/EXEC으로 묶어 중복 제거부터 개수 제한까지 연속 실행합니다.
   */
  async addRecentViewedPost(userId: number, postId: number, limit = 10): Promise<void> {
    const key = RedisKey.list.postRecentViews(userId);
    const value = String(postId);

    // 중복 제거, 최신 위치 추가, 개수 제한을 하나의 Transaction으로 실행합니다.
    // 다른 요청이 세 명령 사이에 끼어들 수 없으므로 동일 게시글의 중복과 순서 변경을 방지합니다.
    await redis
      .multi()
      .lRem(key, 0, value)
      .lPush(key, value)
      .lTrim(key, 0, limit - 1)
      .exec();
  }

  /**
   * Redis List에서 최근 본 게시글 ID 목록을 조회합니다.
   *
   * 1. 사용자별 최근 본 게시글 List key를 만듭니다.
   * 2. Redis List의 앞쪽부터 limit개만 읽습니다.
   * 3. Redis에 문자열로 저장된 게시글 ID를 number로 변환합니다.
   *
   * 실습 포인트:
   * LRANGE는 List의 일부 구간을 조회할 때 사용합니다.
   */
  async getRecentViewedPostIds(userId: number, limit = 10): Promise<number[]> {
    const key = RedisKey.list.postRecentViews(userId);

    // 사용자의 최근 본 게시글 목록에서 필요한 범위의 항목을 조회합니다.
    // 지정한 범위의 값을 순서대로 반환하며, 저장된 항목이 없으면 빈 배열을 반환합니다.
    const values = await redis.lRange(key, 0, limit - 1);

    return values.map(Number);
  }

  /**
   * 최근 본 게시글 ID 목록을 기준으로 DB에서 상세 정보를 조회합니다.
   *
   * 1. Redis List에서 최근 본 게시글 ID 목록을 가져옵니다.
   * 2. DB에서 해당 ID에 해당하는 게시글들을 조회합니다.
   * 3. DB 조회 결과를 Map으로 바꿔 ID로 빠르게 찾을 수 있게 합니다.
   * 4. Redis List의 순서대로 게시글을 다시 배치해 최신순 응답을 만듭니다.
   *
   * 실습 포인트:
   * Redis는 최근 본 순서를 기억하는 보조 저장소로 사용하고, 게시글 원본은 DB를 기준으로 조회합니다.
   *
   * 참고:
   * findMany의 in 조건은 Redis List 순서를 보장하지 않으므로, 조회 후 postIds 순서대로 다시 정렬합니다.
   */
  async getRecentViewedPosts(userId: number, limit = 10): Promise<RecentPostOutput[]> {
    const postIds = await this.getRecentViewedPostIds(userId, limit);

    if (postIds.length === 0) {
      return [];
    }

    const posts = await prisma.post.findMany({
      where: {
        id: {
          in: postIds,
        },
      },
      select: RecentPostSelect,
    });

    const postMap = new Map(posts.map((post) => [post.id, post]));

    // Redis에 남아 있지만 DB에서 삭제된 게시글은 제외하고 응답 형태로 변환합니다.
    return postIds
      .map((postId) => postMap.get(postId))
      .filter((post): post is NonNullable<typeof post> => post !== undefined)
      .map(toRecentPostOutput);
  }

  /**
   * 사용자의 최근 본 게시글 Redis List를 삭제합니다.
   *
   * 1. 사용자별 최근 본 게시글 List key를 만듭니다.
   * 2. Redis에서 해당 key 자체를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key를 삭제하는 명령입니다. 최근 기록 전체 초기화처럼 List 전체가 필요 없을 때 사용합니다.
   */
  async clearRecentViewedPosts(userId: number): Promise<void> {
    const key = RedisKey.list.postRecentViews(userId);
    // 사용자의 최근 본 게시글 목록 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
