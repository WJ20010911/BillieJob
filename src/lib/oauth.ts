import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type OAuthProvider = "qq" | "wechat";

type ProviderConfig = {
  appId: string;
  appSecret: string;
};

export type OAuthUser = {
  id: number;
  identifier: string;
  nickname: string | null;
  membershipDays: number;
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "qq" || value === "wechat";
}

export function getOAuthConfig(provider: OAuthProvider): ProviderConfig | null {
  const appId = provider === "qq" ? process.env.QQ_APP_ID : process.env.WECHAT_APP_ID;
  const appSecret = provider === "qq" ? process.env.QQ_APP_SECRET : process.env.WECHAT_APP_SECRET;
  return appId && appSecret ? { appId, appSecret } : null;
}

export function getOAuthBaseUrl(request: NextRequest) {
  const configured = process.env.AUTH_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  return host ? `${protocol}://${host}` : request.nextUrl.origin;
}

export function getOAuthCallbackUrl(request: NextRequest, provider: OAuthProvider) {
  return `${getOAuthBaseUrl(request)}/api/auth/oauth/${provider}/callback`;
}

export function getOAuthStateCookie(provider: OAuthProvider) {
  return `oauth_state_${provider}`;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/callback\s*\((.*)\)\s*;?/);
    if (match) return JSON.parse(match[1]) as Record<string, unknown>;
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function requireString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value !== "string" || !value) {
    throw new Error(typeof data.error_description === "string" ? data.error_description : `OAuth response missing ${key}`);
  }
  return value;
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  redirectUri: string,
) {
  const config = getOAuthConfig(provider);
  if (!config) throw new Error("OAuth provider is not configured");

  if (provider === "qq") {
    const tokenUrl = new URL("https://graph.qq.com/oauth2.0/token");
    tokenUrl.search = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
      redirect_uri: redirectUri,
      fmt: "json",
    }).toString();
    const tokenData = await readJson(await fetch(tokenUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) }));
    const accessToken = requireString(tokenData, "access_token");

    const meUrl = new URL("https://graph.qq.com/oauth2.0/me");
    meUrl.search = new URLSearchParams({ access_token: accessToken, fmt: "json" }).toString();
    const meData = await readJson(await fetch(meUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) }));
    const openid = requireString(meData, "openid");

    const profileUrl = new URL("https://graph.qq.com/user/get_user_info");
    profileUrl.search = new URLSearchParams({
      access_token: accessToken,
      oauth_consumer_key: config.appId,
      openid,
    }).toString();
    const profile = await readJson(await fetch(profileUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) }));
    return { accountId: openid, nickname: typeof profile.nickname === "string" ? profile.nickname : "QQ用户" };
  }

  const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  tokenUrl.search = new URLSearchParams({
    appid: config.appId,
    secret: config.appSecret,
    code,
    grant_type: "authorization_code",
  }).toString();
  const tokenData = await readJson(await fetch(tokenUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) }));
  const accessToken = requireString(tokenData, "access_token");
  const openid = requireString(tokenData, "openid");

  const profileUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
  profileUrl.search = new URLSearchParams({ access_token: accessToken, openid, lang: "zh_CN" }).toString();
  const profile = await readJson(await fetch(profileUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) }));
  return { accountId: openid, nickname: typeof profile.nickname === "string" ? profile.nickname : "微信用户" };
}

export async function findOrCreateOAuthUser(
  provider: OAuthProvider,
  providerAccountId: string,
  nickname: string,
): Promise<OAuthUser> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });

    if (existing) {
      if (!existing.user.nickname && nickname) {
        return tx.user.update({
          where: { id: existing.userId },
          data: { nickname },
          select: { id: true, identifier: true, nickname: true, membershipDays: true },
        });
      }
      return {
        id: existing.user.id,
        identifier: existing.user.identifier,
        nickname: existing.user.nickname,
        membershipDays: existing.user.membershipDays,
      };
    }

    return tx.user.create({
      data: {
        identifier: `oauth:${provider}:${providerAccountId}`,
        nickname,
        oauthAccounts: { create: { provider, providerAccountId } },
      },
      select: { id: true, identifier: true, nickname: true, membershipDays: true },
    });
  });
}
