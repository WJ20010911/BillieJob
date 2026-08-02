import { NextRequest, NextResponse } from "next/server";
import {
  exchangeOAuthCode,
  findOrCreateOAuthUser,
  getOAuthBaseUrl,
  getOAuthCallbackUrl,
  getOAuthStateCookie,
  isOAuthProvider,
  type OAuthUser,
} from "@/lib/oauth";

type OAuthResult =
  | { type: "billiejob-oauth"; user: OAuthUser }
  | { type: "billiejob-oauth"; error: string };

function popupResponse(origin: string, result: OAuthResult) {
  const payload = JSON.stringify(result).replace(/</g, "\\u003c");
  const targetOrigin = JSON.stringify(origin);
  const success = "user" in result;
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BillieJob 登录</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a">
  <main style="text-align:center;padding:32px"><h1 style="font-size:20px">${success ? "登录成功" : "登录未完成"}</h1><p style="color:#64748b">${success ? "窗口即将关闭" : "请关闭窗口后重试"}</p></main>
  <script>if(window.opener){window.opener.postMessage(${payload},${targetOrigin});setTimeout(function(){window.close()},250)}</script>
</body></html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = new URL(getOAuthBaseUrl(request)).origin;
  if (!isOAuthProvider(provider)) {
    return popupResponse(origin, { type: "billiejob-oauth", error: "不支持的登录方式" });
  }

  const stateCookie = getOAuthStateCookie(provider);
  const expectedState = request.cookies.get(stateCookie)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");

  let response: NextResponse;
  try {
    if (providerError) throw new Error("用户取消了授权");
    if (!state || !expectedState || state !== expectedState) throw new Error("登录请求已失效，请重试");
    if (!code) throw new Error("授权平台未返回登录凭证");

    const profile = await exchangeOAuthCode(provider, code, getOAuthCallbackUrl(request, provider));
    const user = await findOrCreateOAuthUser(provider, profile.accountId, profile.nickname);
    response = popupResponse(origin, { type: "billiejob-oauth", user });
  } catch (error) {
    console.error(`${provider} OAuth callback failed:`, error);
    response = popupResponse(origin, {
      type: "billiejob-oauth",
      error: error instanceof Error ? error.message : "第三方登录失败",
    });
  }
  response.cookies.delete(stateCookie);
  return response;
}
