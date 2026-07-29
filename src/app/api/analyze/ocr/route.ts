import { NextRequest, NextResponse } from "next/server";
import { callZhipuFileParser, getAIConfig, getOCRApiKey } from "@/lib/ai-analysis";

const SESSION_COOKIE = "admin_session";

export async function POST(request: NextRequest) {
  try {
    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Only images up to 10MB are supported" }, { status: 400 });
    }

    const aiConfig = await getAIConfig();
    const provider = aiConfig?.provider.toLowerCase() || "";
    const isZhipu = provider.includes("zhipu") || provider.includes("智谱") || aiConfig?.endpoint.includes("bigmodel.cn");
    if (aiConfig?.enabled && isZhipu && aiConfig.apiKey) {
      try {
        const text = await callZhipuFileParser(file, aiConfig.apiKey);
        if (text) return NextResponse.json({ text, provider: "zhipu" });
      } catch (error) {
        console.warn("Zhipu file parser failed, falling back to OCR.space:", error);
      }
    }

    const apiKey = await getOCRApiKey();
    if (!apiKey) return NextResponse.json({ error: "请在管理员配置中填写 OCR.space 密钥，或启用智谱 AI 文件解析。" }, { status: 503 });

    const payload = new FormData();
    payload.append("file", file, file.name);
    payload.append("language", "chs");
    payload.append("isOverlayRequired", "false");
    payload.append("OCREngine", "2");
    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: payload,
    });
    const data = await response.json() as {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
      ParsedResults?: Array<{ ParsedText?: string }>;
    };
    if (!response.ok || data.IsErroredOnProcessing) {
      const error = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : data.ErrorMessage;
      return NextResponse.json({ error: error || "OCR service failed" }, { status: 502 });
    }
    const text = (data.ParsedResults || []).map((item) => item.ParsedText || "").join("\n").trim();
    if (!text) return NextResponse.json({ error: "No text was detected" }, { status: 422 });
    return NextResponse.json({ text });
  } catch (error) {
    console.error("OCR proxy error:", error);
    return NextResponse.json({ error: "OCR request failed" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value !== "admin-logged-in") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ configured: Boolean(await getOCRApiKey()) });
}
