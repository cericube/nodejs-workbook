import { prisma } from '../shared/prisma.js';
import { redis } from '../shared/redis.js';
import { RedisKey } from '../shared/redis-key.js';

/**
 * 게시글 좋아요 변경 후 클라이언트에 반환하는 상태 데이터입니다.
 *
 * 호출한 사용자의 좋아요 상태와 Redis Set 기준의 현재 좋아요 수를 함께 담습니다.
 */
export type PostLikeStatusOutput = {
  postId: number;
  userId: number;
  liked: boolean;
  likeCount: number;
};

/**
 * 게시글 좋아요 Set의 현재 상태를 요약한 응답 데이터입니다.
 *
 * 좋아요 수와 좋아요를 누른 사용자 ID 목록을 실습 결과로 확인할 때 사용합니다.
 */
export type PostLikeSummaryOutput = {
  postId: number;
  likeCount: number;
  likedUserIds: number[];
};

export class PostSetService {
  /**
   * 좋아요를 기록할 게시글이 DB에 존재하는지 확인합니다.
   *
   * 1. postId로 Post 테이블에서 게시글 ID만 조회합니다.
   * 2. 게시글이 없으면 Prisma가 예외를 던집니다.
   *
   * 참고:
   * Redis에는 좋아요 사용자 목록만 저장하고, 게시글 원본 존재 여부는 DB를 기준으로 확인합니다.
   */
  private async ensurePostExists(postId: number): Promise<void> {
    await prisma.post.findUniqueOrThrow({
      where: {
        id: postId,
      },
      select: {
        id: true,
      },
    });
  }

  /**
   * 좋아요를 요청한 사용자가 DB에 존재하는지 확인합니다.
   *
   * 1. userId로 User 테이블에서 사용자 ID만 조회합니다.
   * 2. 사용자가 없으면 Prisma가 예외를 던집니다.
   *
   * 참고:
   * 존재하지 않는 사용자 ID가 Redis Set에 들어가지 않도록 좋아요 추가 전에 검증합니다.
   */
  private async ensureUserExists(userId: number): Promise<void> {
    await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });
  }

  /**
   * 게시글 좋아요 Set에 사용자 ID를 추가합니다.
   *
   * 1. 게시글과 사용자가 실제로 존재하는지 확인합니다.
   * 2. 게시글별 좋아요 Redis Set key를 만듭니다.
   * 3. userId를 문자열로 바꿔 Set member로 추가합니다.
   * 4. Set member 개수를 조회해 현재 좋아요 수를 계산합니다.
   * 5. 좋아요 상태와 좋아요 수를 반환합니다.
   *
   * 실습 포인트:
   * Redis Set은 중복 member를 허용하지 않으므로 좋아요 중복 방지에 적합합니다.
   *
   * 참고:
   * 같은 사용자가 같은 게시글에 좋아요를 여러 번 눌러도 SADD 결과로 Set에는 한 번만 저장됩니다.
   */
  async likePost(postId: number, userId: number): Promise<PostLikeStatusOutput> {
    await this.ensurePostExists(postId);
    await this.ensureUserExists(userId);

    const key = RedisKey.set.postLikes(postId);
    const member = String(userId);

    // 게시글 좋아요 사용자 목록에 새 사용자을 중복 없이 기록합니다.
    // 새로 추가한 항목 수를 반환하며, 이미 기록된 사용자이면 0을 반환합니다.
    await redis.sAdd(key, member);

    // 게시글 좋아요 사용자 목록에 기록된 고유 사용자 수를 조회합니다.
    // 중복이 제거된 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    const likeCount = await redis.sCard(key);

    return {
      postId,
      userId,
      liked: true,
      likeCount,
    };
  }

  /**
   * 게시글 좋아요 Set에서 사용자 ID를 제거합니다.
   *
   * 1. 게시글별 좋아요 Redis Set key를 만듭니다.
   * 2. userId를 문자열로 바꿔 Set에서 제거합니다.
   * 3. Set member 개수를 조회해 취소 후 좋아요 수를 계산합니다.
   * 4. 좋아요 취소 상태와 좋아요 수를 반환합니다.
   *
   * 실습 포인트:
   * SREM은 Set에서 특정 member를 제거할 때 사용합니다.
   *
   * 참고:
   * SREM은 member가 없어도 에러를 내지 않으므로, 이미 취소된 좋아요 요청도 안전하게 처리됩니다.
   */
  async unlikePost(postId: number, userId: number): Promise<PostLikeStatusOutput> {
    const key = RedisKey.set.postLikes(postId);
    const member = String(userId);

    // 게시글 좋아요 사용자 목록에서 지정한 사용자을 제거합니다.
    // 제거한 항목 수를 반환하며, 사용자이 없으면 0을 반환합니다.
    await redis.sRem(key, member);

    // 게시글 좋아요 사용자 목록에 기록된 고유 사용자 수를 조회합니다.
    // 중복이 제거된 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    const likeCount = await redis.sCard(key);

    return {
      postId,
      userId,
      liked: false,
      likeCount,
    };
  }

  /**
   * 특정 사용자의 게시글 좋아요 여부를 확인합니다.
   *
   * 1. 게시글별 좋아요 Redis Set key를 만듭니다.
   * 2. userId를 문자열로 바꿔 Set member 존재 여부를 조회합니다.
   * 3. Redis의 1 또는 0 응답을 boolean 값으로 변환합니다.
   *
   * 실습 포인트:
   * SISMEMBER는 Set 안에 특정 member가 있는지 확인할 때 사용합니다.
   *
   * 참고:
   * redis@6.0.0의 sIsMember는 boolean이 아니라 1 또는 0 형태의 number 값을 반환하므로 직접 변환합니다.
   */
  async isPostLikedByUser(postId: number, userId: number): Promise<boolean> {
    const key = RedisKey.set.postLikes(postId);
    const member = String(userId);

    // 지정한 사용자이 게시글 좋아요 사용자 목록에 포함되어 있는지 확인합니다.
    // 포함되어 있으면 1을, 포함되어 있지 않거나 목록이 없으면 0을 반환합니다.
    const result = await redis.sIsMember(key, member);

    return result === 1;
  }

  /**
   * 게시글 좋아요 Set의 member 개수를 조회합니다.
   *
   * 1. 게시글별 좋아요 Redis Set key를 만듭니다.
   * 2. Set에 저장된 member 개수를 반환합니다.
   *
   * 실습 포인트:
   * Set에는 사용자 ID가 중복 없이 저장되므로 SCARD 결과를 좋아요 수로 사용할 수 있습니다.
   */
  async getPostLikeCount(postId: number): Promise<number> {
    const key = RedisKey.set.postLikes(postId);

    // 게시글 좋아요 사용자 목록에 기록된 고유 사용자 수를 조회합니다.
    // 중복이 제거된 전체 항목 수를 반환하며, 목록이 없으면 0을 반환합니다.
    return redis.sCard(key);
  }

  /**
   * 게시글 좋아요 수와 좋아요 사용자 목록을 함께 조회합니다.
   *
   * 1. 게시글별 좋아요 Redis Set key를 만듭니다.
   * 2. Set의 모든 member를 문자열 배열로 조회합니다.
   * 3. 문자열 userId를 number로 변환합니다.
   * 4. 좋아요 수와 사용자 ID 목록을 함께 반환합니다.
   *
   * 실습 포인트:
   * SMEMBERS는 Set에 들어 있는 모든 member를 한 번에 조회합니다.
   *
   * 참고:
   * Redis Set은 순서를 보장하지 않습니다. 응답 순서가 중요하면 별도로 정렬하거나 Sorted Set을 고려해야 합니다.
   */
  async getPostLikeSummary(postId: number): Promise<PostLikeSummaryOutput> {
    const key = RedisKey.set.postLikes(postId);

    // 게시글 좋아요 사용자 목록에 기록된 모든 사용자을 조회합니다.
    // 저장 순서와 관계없이 모든 항목을 반환하며, 목록이 없으면 빈 배열을 반환합니다.
    const members = await redis.sMembers(key);
    const likedUserIds = members.map(Number);

    return {
      postId,
      likeCount: likedUserIds.length,
      likedUserIds,
    };
  }

  /**
   * 게시글 좋아요 Set을 삭제합니다.
   *
   * 1. 게시글별 좋아요 Redis Set key를 만듭니다.
   * 2. Redis에서 해당 key 자체를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key를 삭제하므로 Set에 들어 있던 모든 좋아요 사용자 목록이 함께 사라집니다.
   *
   * 참고:
   * 테스트 초기화나 게시글 삭제 후 Redis 좋아요 데이터를 정리할 때 사용할 수 있습니다.
   */
  async deletePostLikes(postId: number): Promise<void> {
    const key = RedisKey.set.postLikes(postId);

    // 게시글 좋아요 사용자 목록 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
