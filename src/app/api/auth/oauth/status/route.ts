import { NextResponse } from "next/server";
import { getOAuthConfig } from "@/lib/oauth";

export async function GET() {
  return NextResponse.json({
    qq: Boolean(getOAuthConfig("qq")),
    wechat: Boolean(getOAuthConfig("wechat")),
  });
}
