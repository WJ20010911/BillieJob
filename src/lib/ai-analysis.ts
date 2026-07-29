import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const CONFIG_KEY = "ai_analysis";
const OCR_CONFIG_KEY = "ocr_space";
const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
const ZHIPU_FILE_SYNC_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/files/parser/sync";

export interface AIConfig {
  provider: string;
  endpoint: string;
  model: string;
  apiKey: string;
  apiKeyHeader: string;
  enabled: boolean;
}

export interface AIField {
  value?: string;
  state?: "found" | "missing" | "unclear";
}

export interface AIAnalysisOutput {
  summary?: string;
  fields?: Record<string, AIField>;
  findings?: Array<{
    category?: string;
    item?: string;
    level?: "high" | "medium" | "low";
    evidence?: string;
    suggestion?: string;
  }>;
  strengths?: string[];
}

function encryptionSecret() {
  return process.env.AI_CONFIG_ENCRYPTION_KEY?.trim() || process.env.ADMIN_PASSWORD?.trim() || "";
}

function encrypt(value: string) {
  const secret = encryptionSecret();
  if (!secret) throw new Error("AI_CONFIG_ENCRYPTION_KEY is not configured");
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decrypt(value: string) {
  const secret = encryptionSecret();
  if (!secret || !value.startsWith("v1.")) return "";
  try {
    const [, ivText, tagText, encryptedText] = value.split(".");
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function parseStoredValue(value: string): Omit<AIConfig, "apiKey"> & { encryptedApiKey?: string } {
  try {
    const parsed = JSON.parse(value) as Partial<AIConfig> & { encryptedApiKey?: string };
    return {
      provider: typeof parsed.provider === "string" ? parsed.provider : "DeepSeek",
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : DEFAULT_ENDPOINT,
      model: typeof parsed.model === "string" ? parsed.model : "deepseek-chat",
      apiKeyHeader: typeof parsed.apiKeyHeader === "string" ? parsed.apiKeyHeader : "Authorization",
      enabled: parsed.enabled !== false,
      encryptedApiKey: parsed.encryptedApiKey,
    };
  } catch {
    return { provider: "DeepSeek", endpoint: DEFAULT_ENDPOINT, model: "deepseek-chat", apiKeyHeader: "Authorization", enabled: false };
  }
}

export async function getAIConfig(): Promise<AIConfig | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!setting) return null;
  const stored = parseStoredValue(setting.value);
  return { ...stored, apiKey: stored.encryptedApiKey ? decrypt(stored.encryptedApiKey) : "" };
}

export async function saveAIConfig(input: {
  provider: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  apiKeyHeader: string;
  enabled: boolean;
  clearApiKey?: boolean;
}) {
  const previous = await getAIConfig();
  const apiKey = input.clearApiKey ? "" : input.apiKey?.trim() || previous?.apiKey || "";
  const value = JSON.stringify({
    provider: input.provider.trim(),
    endpoint: input.endpoint.trim(),
    model: input.model.trim(),
    apiKeyHeader: input.apiKeyHeader.trim() || "Authorization",
    enabled: input.enabled,
    encryptedApiKey: apiKey ? encrypt(apiKey) : "",
  });
  await prisma.appSetting.upsert({
    where: { key: CONFIG_KEY },
    update: { value },
    create: { key: CONFIG_KEY, value },
  });
}

export async function getOCRApiKey() {
  const setting = await prisma.appSetting.findUnique({ where: { key: OCR_CONFIG_KEY } });
  if (setting?.value) return decrypt(setting.value);
  return process.env.OCR_SPACE_API_KEY?.trim() || "";
}

export async function saveOCRApiKey(apiKey: string, clearApiKey = false) {
  const value = clearApiKey ? "" : apiKey.trim();
  if (!value) {
    await prisma.appSetting.deleteMany({ where: { key: OCR_CONFIG_KEY } });
    return;
  }

  await prisma.appSetting.upsert({
    where: { key: OCR_CONFIG_KEY },
    update: { value: encrypt(value) },
    create: { key: OCR_CONFIG_KEY, value: encrypt(value) },
  });
}

export async function hasOCRApiKey() {
  return Boolean(await getOCRApiKey());
}

function findParsedText(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => findParsedText(item, depth + 1)).filter(Boolean).join("\n").trim();
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["text", "content", "markdown", "file_content", "parsed_text", "result", "data"]) {
    const text = findParsedText(record[key], depth + 1);
    if (text.length >= 12) return text;
  }
  return "";
}

function findTaskId(value: unknown, depth = 0): string {
  if (depth > 4 || value === null || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = findTaskId(item, depth + 1);
      if (id) return id;
    }
    return "";
  }
  const record = value as Record<string, unknown>;
  for (const key of ["task_id", "taskId", "id"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  for (const key of ["data", "result"]) {
    const id = findTaskId(record[key], depth + 1);
    if (id) return id;
  }
  return "";
}

function taskState(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["task_status", "taskStatus", "status"]) {
    if (typeof record[key] === "string") return record[key].toUpperCase();
  }
  return "";
}

async function parseZhipuResponse(response: Response) {
  const body = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("智谱文件解析返回了无效响应");
  }
  if (!response.ok) throw new Error("智谱文件解析接口返回 " + response.status + "：" + body.slice(0, 240));
  return payload;
}

export async function callZhipuFileParser(file: File, apiKey: string, timeoutMs = 50000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const upload = async (endpoint: string) => {
    const form = new FormData();
    form.append("file", file, file.name || "recruitment-file");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: form,
      signal: controller.signal,
    });
    return parseZhipuResponse(response);
  };

  try {
    let payload = await upload(ZHIPU_FILE_SYNC_ENDPOINT);
    let text = findParsedText(payload);
    if (text) return text;

    const taskId = findTaskId(payload);
    if (!taskId) throw new Error("智谱文件解析未返回任务编号或文本");
    const resultEndpoint = "https://open.bigmodel.cn/api/paas/v4/files/parser/result/" + encodeURIComponent(taskId) + "/text";
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(resultEndpoint, { headers: { Authorization: "Bearer " + apiKey }, signal: controller.signal });
      payload = await parseZhipuResponse(response);
      text = findParsedText(payload);
      if (text) return text;
      const state = taskState(payload);
      if (["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(state)) throw new Error("智谱文件解析任务失败");
      if (["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(state)) break;
    }
    throw new Error("智谱文件解析超时，请稍后重试");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("智谱文件解析超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function contentFromResponse(payload: unknown) {
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "object" && part && "text" in part ? String(part.text) : "").join("");
  }
  return "";
}

function parseJson(text: string): AIAnalysisOutput {
  const cleaned = text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI returned no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1)) as AIAnalysisOutput;
}

const SYSTEM_PROMPT = [
  "You analyze Chinese recruitment postings for job seekers.",
  "Use only the supplied source text. Never invent a value.",
  "Every found value must be a short exact quote copied from the source text.",
  "If a field is absent, use value NOT_MENTIONED and state missing.",
  "If a label exists but its amount or rule is unclear, use state unclear and quote the label.",
  "Return JSON only, with no markdown.",
  "The fields are: salary, salaryRange, salaryStructure, salaryBase, commission, performance, taskRequirement, duties, location, requirements, workTime, dailyHours, weeklyHours, weeklyWorkDays, shiftWork, overtimePolicy, benefits, monthlyAllowance, dailyAllowance, mealAllowance, transportAllowance, housingAllowance, bonus, socialBenefits, employment, process.",
  "Return fields as an object, findings as an array with category, item, level, evidence, suggestion, and strengths as an array.",
].join(" ");

export async function callJobAnalysisAI(rawText: string): Promise<AIAnalysisOutput | null> {
  const config = await getAIConfig();
  if (!config?.enabled || !config.apiKey || !config.endpoint || !config.model) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKeyHeader.toLowerCase() === "authorization") headers[config.apiKeyHeader] = "Bearer " + config.apiKey;
    else headers[config.apiKeyHeader] = config.apiKey;
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ sourceText: rawText }) },
        ],
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error("AI service returned " + response.status + ": " + body.slice(0, 300));
    return parseJson(contentFromResponse(JSON.parse(body)));
  } finally {
    clearTimeout(timeout);
  }
}

export function aiConfigDefaults() {
  return { provider: "DeepSeek", endpoint: DEFAULT_ENDPOINT, model: "deepseek-chat", apiKeyHeader: "Authorization", enabled: false };
}

export function hasAIEncryptionSecret() {
  return Boolean(encryptionSecret());
}
