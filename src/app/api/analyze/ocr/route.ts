import { NextRequest, NextResponse } from "next/server";
import { getOCRApiKey } from "@/lib/ai-analysis";

const SESSION_COOKIE = "admin_session";

export async function POST(request: NextRequest) {
  const apiKey = await getOCRApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "OCR.space API key is not configured on the server" }, { status: 503 });
  }

  try {
    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Only images up to 10MB are supported" }, { status: 400 });
    }

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
