import { NextRequest, NextResponse } from "next/server";
import { getOCRApiKey, hasAIEncryptionSecret, saveOCRApiKey } from "@/lib/ai-analysis";

const SESSION_COOKIE = "admin_session";
const SESSION_TOKEN = "admin-logged-in";

function authorized(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value === SESSION_TOKEN;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ configured: Boolean(await getOCRApiKey()), encryptionConfigured: hasAIEncryptionSecret() });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { apiKey?: unknown; clearApiKey?: unknown };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    await saveOCRApiKey(apiKey, body.clearApiKey === true);
    return NextResponse.json({ success: true, configured: Boolean(await getOCRApiKey()) });
  } catch (error) {
    console.error("Save OCR config error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "OCR 配置保存失败" }, { status: 500 });
  }
}
