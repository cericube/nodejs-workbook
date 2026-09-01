/**
 * 인증 서비스의 결과를 HTTP 응답으로 변환합니다.
 * 액세스 JWT는 클라이언트가 Authorization 헤더에 사용할 수 있도록 본문으로 반환하고,
 * 수명이 긴 리프레시 토큰은 JavaScript에서 읽지 못하는 HttpOnly 쿠키로 분리합니다.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import type { AuthService } from './auth.service';
import type { AuthTokenResponseDto, LoginBodyDto } from './auth.schema';
import type { AuthTokenResult } from './auth.types';

interface AuthControllerOptions {
  // 리프레시 토큰을 읽고 설정할 때 사용할 쿠키 이름입니다.
  refreshCookieName: string;
  // 운영 HTTPS 환경에서는 true로 설정해 브라우저가 HTTP 요청에 쿠키를 보내지 않게 합니다.
  secureCookie: boolean;
}

export class AuthController {
  // 인증 처리와 쿠키 환경 설정을 외부에서 받아 HTTP 계층의 역할에 집중합니다.
  constructor(
    private readonly authService: AuthService,
    private readonly options: AuthControllerOptions,
  ) {}

  /** 로그인 결과의 리프레시 토큰은 응답 본문이 아닌 HttpOnly 쿠키로 전달합니다. */
  async login(body: LoginBodyDto, reply: FastifyReply) {
    const result = await this.authService.login(body.email, body.password);
    this.setRefreshCookie(reply, result);
    return reply.code(200).send(toAuthTokenResponse(result));
  }

  /** 쿠키의 리프레시 토큰을 교체한 뒤 새 쿠키와 액세스 토큰을 반환합니다. */
  async refresh(request: FastifyRequest, reply: FastifyReply) {
    // 리프레시 토큰은 응답 본문에 노출하지 않고 지정된 HttpOnly 쿠키에서만 읽습니다.
    const refreshToken = request.cookies[this.options.refreshCookieName];

    if (refreshToken === undefined) {
      throw new BusinessError(ErrorCode.UNAUTHORIZED, 'Refresh Token이 필요합니다.', 401);
    }

    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(reply, result);
    return reply.code(200).send(toAuthTokenResponse(result));
  }

  /** 현재 리프레시 세션을 제거하고 브라우저 쿠키도 삭제합니다. */
  async logout(request: FastifyRequest, reply: FastifyReply) {
    await this.authService.logout(request.cookies[this.options.refreshCookieName]);
    this.clearRefreshCookie(reply);
    return reply.code(204).send();
  }

  /** 액세스 JWT의 사용자 ID에 연결된 모든 리프레시 세션을 제거합니다. */
  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    // authenticate 가드가 검증한 JWT의 sub에는 문자열 형태의 사용자 ID가 들어 있습니다.
    const userId = Number(request.user.sub);

    if (!Number.isInteger(userId) || userId < 1) {
      throw new BusinessError(ErrorCode.TOKEN_INVALID, '유효하지 않은 사용자 토큰입니다.', 401);
    }

    await this.authService.logoutAll(userId);
    this.clearRefreshCookie(reply);
    return reply.code(204).send();
  }

  /** 리프레시 토큰의 서버 만료 시각을 쿠키 maxAge로 변환해 브라우저 만료 시점도 맞춥니다. */
  private setRefreshCookie(reply: FastifyReply, result: AuthTokenResult): void {
    // 서버 세션과 브라우저 쿠키가 가능한 한 같은 시점에 만료되도록 남은 초를 계산합니다.
    const maxAge = Math.max(
      1,
      Math.floor((result.refreshTokenExpiresAt.getTime() - Date.now()) / 1_000),
    );

    reply.setCookie(this.options.refreshCookieName, result.refreshToken, {
      // JavaScript에서 쿠키를 읽을 수 없게 해 XSS를 통한 토큰 탈취 위험을 줄입니다.
      httpOnly: true,
      // true이면 HTTPS 연결에서만 쿠키가 전송됩니다. 로컬 HTTP 개발 환경에서는 false를 사용합니다.
      secure: this.options.secureCookie,
      // 다른 사이트에서 시작된 요청에는 쿠키를 보내지 않아 CSRF 위험을 줄입니다.
      sameSite: 'strict',
      // 인증 API에서만 리프레시 토큰 쿠키를 전송하도록 경로를 제한합니다.
      path: '/api/auth',
      maxAge,
    });
  }

  /** 설정할 때와 같은 옵션으로 리프레시 토큰 쿠키를 만료시켜 브라우저에서 제거합니다. */
  private clearRefreshCookie(reply: FastifyReply): void {
    reply.clearCookie(this.options.refreshCookieName, {
      httpOnly: true,
      secure: this.options.secureCookie,
      sameSite: 'strict',
      path: '/api/auth',
    });
  }
}

/** 내부 결과에서 쿠키로 전달할 리프레시 토큰을 제외하고 공개 응답 구조만 만듭니다. */
function toAuthTokenResponse(result: AuthTokenResult): AuthTokenResponseDto {
  return {
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: result.accessTokenExpiresIn,
    user: result.user,
  };
}
