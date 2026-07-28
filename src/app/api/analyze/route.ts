import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type FindingLevel = "high" | "medium" | "low";
type FieldState = "found" | "missing" | "unclear";

interface Finding {
  category: string;
  item: string;
  level: FindingLevel;
  evidence: string;
  suggestion: string;
}

interface AnalysisResult {
  riskScore: number;
  summary: string;
  fields: Record<string, { value: string; state: FieldState }>;
  findings: Finding[];
  strengths: string[];
}

const WORDS = {
  missing: "\u672a\u8bc6\u522b\u5230",
  salary: "\u85aa\u8d44",
  work: "\u5de5\u4f5c",
  duties: "\u5c97\u4f4d\u804c\u8d23",
  location: "\u5de5\u4f5c\u5730\u70b9",
  requirements: "\u4efb\u804c\u8981\u6c42",
  hours: "\u5de5\u4f5c\u5236\u5ea6",
  benefits: "\u798f\u5229\u5f85\u9047",
  employment: "\u7528\u5de5\u7c7b\u578b",
  process: "\u62db\u8058\u6d41\u7a0b",
};

function getUserId(request: NextRequest) {
  const value = Number(request.headers.get("x-user-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function firstMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[0]?.trim() || "";
}

function snippet(text: string, pattern: RegExp, limit = 100) {
  const index = text.search(pattern);
  if (index < 0) return "";
  return text.slice(index, index + limit).split(/[\u3002\uff1b;.!\uff01\uff1f]/u)[0].trim();
}

function analyzeText(rawText: string, companyName?: string | null): AnalysisResult {
  const text = rawText.replace(/\s+/g, " ").trim();
  const findings: Finding[] = [];
  const fields: AnalysisResult["fields"] = {};
  const salaryNumber = firstMatch(text, /\d+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)(?:\s*[-~\u81f3\u5230]\s*\d+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143))?(?:\/\u6708|\/\u5e74)?/u);
  const salaryFound = Boolean(salaryNumber) || has(text, /\u85aa\u8d44|\u5de5\u8d44|\u6708\u85aa|\u5e74\u85aa|\u85aa\u916c/u);
  const salaryUnclear = has(text, /\u9762\u8bae|\u85aa\u8d44\u53ef\u8c08|\u5f85\u9047\u4f18\u539a|\u9ad8\u85aa|\u4e30\u539a/u) && !salaryNumber;
  fields.salary = { value: salaryNumber || (salaryUnclear ? "\u9762\u8bae/\u7b3c\u7edf\u8868\u8ff0" : salaryFound ? snippet(text, /\u85aa\u8d44|\u5de5\u8d44|\u6708\u85aa|\u5e74\u85aa|\u85aa\u916c/u) : WORDS.missing), state: salaryFound ? (salaryUnclear ? "unclear" : "found") : "missing" };

  const locationValue = firstMatch(text, /\u5317\u4eac(?:\u5e02)?|\u4e0a\u6d77(?:\u5e02)?|\u5e7f\u5dde(?:\u5e02)?|\u6df1\u5733(?:\u5e02)?|\u676d\u5dde(?:\u5e02)?|\u6210\u90fd(?:\u5e02)?|\u6b66\u6c49(?:\u5e02)?|\u5357\u4eac(?:\u5e02)?|\u82cf\u5dde(?:\u5e02)?|\u897f\u5b89(?:\u5e02)?|\u91cd\u5e86(?:\u5e02)?|\u8fdc\u7a0b|\u5728\u5bb6\u529e\u516c/u) || snippet(text, /\u5de5\u4f5c\u5730\u70b9|\u5de5\u4f5c\u5730|\u529e\u516c\u5730\u70b9|\u5730\u5740/u, 60);
  fields.location = { value: locationValue || WORDS.missing, state: locationValue ? "found" : "missing" };

  const dutyPattern = /\u5c97\u4f4d\u804c\u8d23|\u5de5\u4f5c\u5185\u5bb9|\u4e3b\u8981\u8d1f\u8d23|\u804c\u8d23\u63cf\u8ff0|\u65e5\u5e38\u5de5\u4f5c|\u8d1f\u8d23/u;
  const dutyValue = snippet(text, dutyPattern);
  const dutyFound = Boolean(dutyValue);
  const dutyVague = text.length < 100 || has(text, /\u5176\u4ed6\u4e34\u65f6\u5b89\u6392|\u5b8c\u6210\u9886\u5bfc\u4ea4\u529e|\u670d\u4ece\u5b89\u6392|\u5de5\u4f5c\u5185\u5bb9\u4e0d\u9650|\u534f\u52a9\u5176\u4ed6\u5de5\u4f5c/u);
  fields.duties = { value: dutyValue || WORDS.missing, state: dutyFound ? (dutyVague ? "unclear" : "found") : "missing" };

  const requirementsValue = snippet(text, /\u4efb\u804c\u8981\u6c42|\u4efb\u804c\u8d44\u683c|\u5c97\u4f4d\u8981\u6c42|\u5b66\u5386|\u7ecf\u9a8c\u8981\u6c42|\u6280\u80fd\u8981\u6c42|\u672c\u79d1|\u5927\u4e13|\u5e74\u4ee5\u4e0a\u7ecf\u9a8c/u);
  fields.requirements = { value: requirementsValue || WORDS.missing, state: requirementsValue ? "found" : "missing" };

  const hoursValue = firstMatch(text, /\u53cc\u4f11|\u5355\u4f11|\u5927\u5c0f\u5468|\u52a0\u73ed|996|\u671d\u4e5d\u665a\u516d|\u5f39\u6027\u5de5\u4f5c|\u5de5\u4f5c\u65f6\u95f4|\u4e0a\u73ed\u65f6\u95f4/u);
  fields.hours = { value: hoursValue || WORDS.missing, state: hoursValue ? "found" : "missing" };

  const benefitsValue = firstMatch(text, /\u4e94\u9669\u4e00\u91d1|\u4e94\u9669|\u793e\u4fdd|\u516c\u79ef\u91d1|\u5e26\u85aa|\u798f\u5229|\u8865\u8d34|\u5e74\u7ec8\u5956|\u9910\u8865|\u623f\u8865/u);
  fields.benefits = { value: benefitsValue || WORDS.missing, state: benefitsValue ? "found" : "missing" };

  const employmentValue = firstMatch(text, /\u5168\u804c|\u517c\u804c|\u5b9e\u4e60|\u52b3\u52a1|\u52b3\u52a8\u5408\u540c|\u6b63\u5f0f|\u793e\u62db|\u6821\u62db|\u5916\u5305/u);
  fields.employment = { value: employmentValue || WORDS.missing, state: employmentValue ? "found" : "missing" };

  const processValue = firstMatch(text, /\u9762\u8bd5|\u7b14\u8bd5|\u62db\u8058\u6d41\u7a0b|\u51e0\u8f6e|\u5165\u804c\u6d41\u7a0b|\u8bd5\u7528\u671f/u);
  fields.process = { value: processValue || WORDS.missing, state: processValue ? "found" : "missing" };

  if (!salaryFound) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u7f3a\u5c11\u660e\u786e\u7684\u85aa\u8d44\u8303\u56f4", level: "high", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u6708\u85aa\u3001\u5e74\u85aa\u6216\u85aa\u8d44\u533a\u95f4\u3002", suggestion: "\u786e\u8ba4\u6708\u85aa/\u5e74\u85aa\u8303\u56f4\u3001\u56fa\u5b9a\u85aa\u8d44\u3001\u7ee9\u6548\u63d0\u6210\u548c\u8bd5\u7528\u671f\u85aa\u8d44\u3002" });
  else if (salaryUnclear) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u85aa\u8d44\u53ea\u6709\u9762\u8bae\u6216\u7b3c\u7edf\u8868\u8ff0", level: "medium", evidence: `\u8bc6\u522b\u5230\uff1a${fields.salary.value}\uff0c\u4f46\u6ca1\u6709\u5177\u4f53\u6570\u5b57\u3002`, suggestion: "\u8981\u6c42\u5bf9\u65b9\u7ed9\u51fa\u5e95\u85aa\u3001\u7ee9\u6548\u3001\u63d0\u6210\u548c\u8bd5\u7528\u671f\u7684\u5177\u4f53\u8303\u56f4\u3002" });
  if (!dutyFound) findings.push({ category: "\u5de5\u4f5c\u5185\u5bb9", item: "\u7f3a\u5c11\u5c97\u4f4d\u804c\u8d23", level: "high", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u5c97\u4f4d\u804c\u8d23\u6216\u5de5\u4f5c\u5185\u5bb9\u6bb5\u843d\u3002", suggestion: "\u8981\u6c42\u8865\u5145\u65e5\u5e38\u4efb\u52a1\u3001\u4ea4\u4ed8\u76ee\u6807\u3001\u6c47\u62a5\u5bf9\u8c61\u548c\u5de5\u4f5c\u8fb9\u754c\u3002" });
  else if (dutyVague) findings.push({ category: "\u5de5\u4f5c\u5185\u5bb9", item: "\u5de5\u4f5c\u5185\u5bb9\u53ef\u80fd\u6a21\u7cca", level: "medium", evidence: `\u8bc6\u522b\u5230\uff1a${fields.duties.value}`, suggestion: "\u628a\u9ad8\u9891\u4efb\u52a1\u3001\u5de5\u4f5c\u5360\u6bd4\u3001\u52a0\u73ed\u573a\u666f\u548c\u8de8\u5c97\u804c\u8d23\u95ee\u6e05\u695a\u3002" });
  if (!locationValue) findings.push({ category: "\u5de5\u4f5c\u5730\u70b9", item: "\u5de5\u4f5c\u5730\u70b9\u4e0d\u660e\u786e", level: "medium", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u57ce\u5e02\u3001\u529e\u516c\u5730\u70b9\u6216\u8fdc\u7a0b\u4fe1\u606f\u3002", suggestion: "\u786e\u8ba4\u529e\u516c\u57ce\u5e02\u3001\u5177\u4f53\u533a\u57df\u3001\u662f\u5426\u51fa\u5dee\u4ee5\u53ca\u662f\u5426\u652f\u6301\u8fdc\u7a0b\u3002" });
  if (!requirementsValue) findings.push({ category: "\u4efb\u804c\u8981\u6c42", item: "\u7f3a\u5c11\u4efb\u804c\u8981\u6c42", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u5b66\u5386\u3001\u7ecf\u9a8c\u6216\u6280\u80fd\u8981\u6c42\u3002", suggestion: "\u786e\u8ba4\u786c\u6027\u95e8\u69db\u3001\u4f18\u5148\u6280\u80fd\u548c\u7b5b\u9009\u89c4\u5219\u3002" });
  if (!hoursValue) findings.push({ category: "\u5de5\u4f5c\u5236\u5ea6", item: "\u5de5\u4f5c\u65f6\u95f4\u548c\u52a0\u73ed\u5236\u5ea6\u7f3a\u5931", level: "medium", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u53cc\u4f11\u3001\u5de5\u4f5c\u65f6\u6bb5\u3001\u52a0\u73ed\u6216\u8c03\u4f11\u4fe1\u606f\u3002", suggestion: "\u786e\u8ba4\u5de5\u4f5c\u65e5\u3001\u4e0a\u4e0b\u73ed\u65f6\u95f4\u3001\u52a0\u73ed\u9891\u7387\u3001\u52a0\u73ed\u8d39\u6216\u8c03\u4f11\u89c4\u5219\u3002" });
  if (!benefitsValue) findings.push({ category: "\u798f\u5229\u5f85\u9047", item: "\u798f\u5229\u5f85\u9047\u4e0d\u5b8c\u6574", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u793e\u4fdd\u3001\u516c\u79ef\u91d1\u6216\u5176\u4ed6\u798f\u5229\u4fe1\u606f\u3002", suggestion: "\u786e\u8ba4\u793e\u4fdd\u516c\u79ef\u91d1\u7f34\u7eb3\u57fa\u6570\u3001\u8bd5\u7528\u671f\u7f34\u7eb3\u60c5\u51b5\u548c\u8865\u8d34\u5956\u91d1\u3002" });
  if (!employmentValue) findings.push({ category: "\u7528\u5de5\u5173\u7cfb", item: "\u7528\u5de5\u7c7b\u578b\u4e0d\u6e05\u6670", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u5168\u804c\u3001\u5b9e\u4e60\u3001\u5916\u5305\u6216\u5408\u540c\u7c7b\u578b\u3002", suggestion: "\u786e\u8ba4\u52b3\u52a8\u5408\u540c\u4e3b\u4f53\u3001\u7528\u5de5\u7c7b\u578b\u3001\u8bd5\u7528\u671f\u548c\u8f6c\u6b63\u6761\u4ef6\u3002" });
  if (!processValue) findings.push({ category: "\u62db\u8058\u6d41\u7a0b", item: "\u62db\u8058\u6d41\u7a0b\u4e0d\u900f\u660e", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u9762\u8bd5\u8f6e\u6b21\u3001\u7b14\u8bd5\u6216\u8bd5\u7528\u671f\u4fe1\u606f\u3002", suggestion: "\u786e\u8ba4\u9762\u8bd5\u8f6e\u6b21\u3001\u51b3\u7b56\u4eba\u3001\u53cd\u9988\u65f6\u95f4\u548c\u8bd5\u7528\u671f\u8003\u6838\u3002" });
  if (has(text, /\u65e0\u8d23\u5e95\u85aa|\u7eaf\u63d0\u6210|\u9ad8\u63d0\u6210/u) && !salaryNumber) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u53ef\u80fd\u5b58\u5728\u6536\u5165\u7ed3\u6784\u98ce\u9669", level: "high", evidence: "\u51fa\u73b0\u65e0\u8d23\u5e95\u85aa\u3001\u7eaf\u63d0\u6210\u6216\u9ad8\u63d0\u6210\uff0c\u4f46\u672a\u7ed9\u51fa\u91d1\u989d\u3002", suggestion: "\u8981\u6c42\u4e66\u9762\u786e\u8ba4\u56fa\u5b9a\u85aa\u8d44\u3001\u63d0\u6210\u53e3\u5f84\u3001\u53d1\u653e\u6761\u4ef6\u548c\u5386\u53f2\u8fbe\u6210\u7387\u3002" });

  const strengths: string[] = [];
  if (salaryNumber) strengths.push(`\u85aa\u8d44\uff1a${salaryNumber}`);
  if (dutyFound && !dutyVague) strengths.push("\u5c97\u4f4d\u804c\u8d23\u6709\u5177\u4f53\u63cf\u8ff0");
  if (locationValue) strengths.push(`\u5730\u70b9\uff1a${locationValue}`);
  if (benefitsValue) strengths.push(`\u798f\u5229\uff1a${benefitsValue}`);

  const riskScore = Math.max(0, Math.min(100, 100 - findings.reduce((total, item) => total + (item.level === "high" ? 20 : item.level === "medium" ? 12 : 6), 0)));
  const company = companyName ? `“${companyName}”` : "\u8fd9\u6761\u62db\u8058\u4fe1\u606f";
  const summary = riskScore >= 80 ? `${company}\u4fe1\u606f\u76f8\u5bf9\u5b8c\u6574\uff0c\u4f46\u4ecd\u5efa\u8bae\u5728\u6c9f\u901a\u65f6\u6838\u5b9e\u5173\u952e\u6761\u4ef6\u3002` : riskScore >= 55 ? `${company}\u5b58\u5728\u82e5\u5e72\u9700\u8981\u8865\u5145\u786e\u8ba4\u7684\u6761\u4ef6\uff0c\u5efa\u8bae\u4e0d\u8981\u53ea\u51ed\u622a\u56fe\u505a\u51b3\u5b9a\u3002` : `${company}\u5173\u952e\u5b57\u6bb5\u7f3a\u53e3\u8f83\u591a\uff0c\u5efa\u8bae\u5148\u8865\u9f50\u85aa\u8d44\u3001\u804c\u8d23\u548c\u7528\u5de5\u6761\u4ef6\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u63a8\u8fdb\u3002`;
  return { riskScore, summary, fields, findings, strengths };
}

function serialize<T extends { resultJson: string; rawText: string; companyName: string | null }>(item: T) {
  const result = analyzeText(item.rawText, item.companyName);
  return { ...item, riskScore: result.riskScore, result };
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "\u672a\u767b\u5f55" }, { status: 401 });
  try {
    const items = await prisma.jobAnalysis.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ items: items.map(serialize) });
  } catch (error) {
    console.error("Load analysis archives error:", error);
    return NextResponse.json({ error: "\u83b7\u53d6\u5206\u6790\u5b58\u6863\u5931\u8d25" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "\u8bf7\u5148\u767b\u5f55\u540e\u4fdd\u5b58\u5206\u6790" }, { status: 401 });
  try {
    const body = await request.json();
    const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
    if (rawText.length < 12) return NextResponse.json({ error: "\u8bf7\u8865\u5145\u81f3\u5c11 12 \u4e2a\u5b57\u7684\u62db\u8058\u6587\u5b57" }, { status: 400 });
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() || null : null;
    const result = analyzeText(rawText, companyName);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "\u672a\u547d\u540d\u62db\u8058\u5206\u6790";
    const item = await prisma.jobAnalysis.create({ data: { userId, title, companyName, source: typeof body.source === "string" ? body.source.trim() || null : null, imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim() || null : null, rawText, resultJson: JSON.stringify(result), riskScore: result.riskScore } });
    return NextResponse.json({ success: true, item: serialize(item), result });
  } catch (error) {
    console.error("Create analysis archive error:", error);
    return NextResponse.json({ error: "\u5206\u6790\u4fdd\u5b58\u5931\u8d25" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "\u672a\u767b\u5f55" }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "\u5b58\u6863\u53c2\u6570\u65e0\u6548" }, { status: 400 });
  await prisma.jobAnalysis.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
