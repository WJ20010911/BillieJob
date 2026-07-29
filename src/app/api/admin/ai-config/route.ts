import { NextRequest, NextResponse } from "next/server";
import { aiConfigDefaults, getAIConfig, hasAIEncryptionSecret, saveAIConfig, testAIConnection } from "@/lib/ai-analysis";

const SESSION_COOKIE = "admin_session";
const SESSION_TOKEN = "admin-logged-in";

function authorized(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value === SESSION_TOKEN;
}

function summary(config: Awaited<ReturnType<typeof getAIConfig>>) {
  const defaults = aiConfigDefaults();
  return {
    provider: config?.provider || defaults.provider,
    endpoint: config?.endpoint || defaults.endpoint,
    model: config?.model || defaults.model,
    apiKeyHeader: config?.apiKeyHeader || defaults.apiKeyHeader,
    enabled: config?.enabled || false,
    apiKeyConfigured: Boolean(config?.apiKey),
    encryptionConfigured: hasAIEncryptionSecret(),
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(summary(await getAIConfig()));
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const apiKeyHeader = typeof body.apiKeyHeader === "string" ? body.apiKeyHeader.trim() : "Authorization";
    if (!provider || !model || !endpoint) return NextResponse.json({ error: "服务商、接口地址和模型名不能为空" }, { status: 400 });
    let parsedEndpoint: URL;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      return NextResponse.json({ error: "接口地址必须是完整的 http 或 https 地址" }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsedEndpoint.protocol)) return NextResponse.json({ error: "接口地址只支持 http 或 https" }, { status: 400 });
    if (!/^[A-Za-z0-9-]+$/.test(apiKeyHeader)) return NextResponse.json({ error: "API 密钥请求头格式无效" }, { status: 400 });
    await saveAIConfig({
      provider: provider.slice(0, 80),
      endpoint: endpoint.slice(0, 500),
      model: model.slice(0, 120),
      apiKeyHeader,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      clearApiKey: body.clearApiKey === true,
      enabled: body.enabled === true,
    });
    return NextResponse.json({ success: true, ...summary(await getAIConfig()) });
  } catch (error) {
    console.error("Save AI config error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 配置保存失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await testAIConnection();
    if (!result) return NextResponse.json({ error: "请先保存并启用 AI 配置，同时填写 API 密钥。" }, { status: 400 });
    return NextResponse.json({ success: true, message: "AI 接口连接成功，已收到结构化 JSON。" });
  } catch (error) {
    console.error("Test AI config error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 接口测试失败" }, { status: 502 });
  }
}
