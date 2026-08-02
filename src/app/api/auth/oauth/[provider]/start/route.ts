import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthCallbackUrl,
  getOAuthConfig,
  getOAuthStateCookie,
  isOAuthProvider,
} from "@/lib/oauth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) {
    return NextResponse.json({ error: "不支持的登录方式" }, { status: 404 });
  }

  const config = getOAuthConfig(provider);
  if (!config) {
    return NextResponse.json({ error: "该登录方式尚未配置" }, { status: 503 });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = getOAuthCallbackUrl(request, provider);
  const authorizeUrl = provider === "qq"
    ? new URL("https://graph.qq.com/oauth2.0/authorize")
    : new URL("https://open.weixin.qq.com/connect/qrconnect");

  authorizeUrl.search = new URLSearchParams(provider === "qq" ? {
    response_type: "code",
    client_id: config.appId,
    redirect_uri: redirectUri,
    state,
    scope: "get_user_info",
  } : {
    appid: config.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snsapi_login",
    state,
  }).toString();
  if (provider === "wechat") authorizeUrl.hash = "wechat_redirect";

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(getOAuthStateCookie(provider), state, {
    httpOnly: true,
    secure: redirectUri.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
