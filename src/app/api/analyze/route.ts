import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type FindingLevel = "high" | "medium" | "low";

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
  fields: Record<string, { value: string; state: "found" | "missing" | "unclear" }>;
  findings: Finding[];
  strengths: string[];
}

function getUserId(request: NextRequest) {
  const value = Number(request.headers.get("x-user-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function analyzeText(rawText: string, companyName?: string | null): AnalysisResult {
  const text = rawText.replace(/\s+/g, " ").trim();
  const findings: Finding[] = [];
  const fields: AnalysisResult["fields"] = {};

  const salaryFound = has(text, /(薪资|工资|月薪|年薪|薪酬|\d+\s*[kK万千元])/);
  const salaryUnclear = has(text, /(面议|薪资可谈|待遇优厚|高薪|丰厚)/) && !has(text, /(\d+\s*[kK万千元])/);
  fields.salary = { value: salaryFound ? (salaryUnclear ? "仅写明面议或高薪" : "已出现薪资信息") : "未识别到", state: salaryFound ? (salaryUnclear ? "unclear" : "found") : "missing" };

  const locationFound = has(text, /(工作地点|工作地|办公地点|地址|坐标|北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|远程|在家办公)/);
  fields.location = { value: locationFound ? "已出现地点线索" : "未识别到", state: locationFound ? "found" : "missing" };

  const dutyFound = has(text, /(岗位职责|工作内容|主要负责|职责描述|日常工作|负责)/);
  const dutyVague = text.length < 100 || has(text, /(其他临时安排|完成领导交办|服从安排|工作内容不限|协助其他工作)/);
  fields.duties = { value: dutyFound ? (dutyVague ? "有描述但可能偏模糊" : "已出现职责描述") : "未识别到", state: dutyFound ? (dutyVague ? "unclear" : "found") : "missing" };

  const requirementsFound = has(text, /(任职要求|任职资格|岗位要求|学历|经验要求|技能要求|本科|大专|年以上经验)/);
  fields.requirements = { value: requirementsFound ? "已出现要求线索" : "未识别到", state: requirementsFound ? "found" : "missing" };

  const hoursFound = has(text, /(工作时间|上班时间|双休|单休|大小周|加班|996|朝九晚六|弹性工作)/);
  fields.hours = { value: hoursFound ? "已出现工作时间线索" : "未识别到", state: hoursFound ? "found" : "missing" };

  const benefitsFound = has(text, /(五险一金|五险|社保|公积金|带薪|福利|补贴|年终奖|餐补|房补)/);
  fields.benefits = { value: benefitsFound ? "已出现福利线索" : "未识别到", state: benefitsFound ? "found" : "missing" };

  const employmentFound = has(text, /(全职|兼职|实习|劳务|劳动合同|正式|社招|校招|外包)/);
  fields.employment = { value: employmentFound ? "已出现用工类型线索" : "未识别到", state: employmentFound ? "found" : "missing" };

  const processFound = has(text, /(面试|笔试|招聘流程|几轮|入职流程|试用期)/);
  fields.process = { value: processFound ? "已出现流程线索" : "未识别到", state: processFound ? "found" : "missing" };

  if (!salaryFound) findings.push({ category: "薪资透明度", item: "缺少明确的薪资范围", level: "high", evidence: "正文中没有识别到月薪、年薪或薪资区间。", suggestion: "确认月薪/年薪范围、发薪结构和试用期薪资。" });
  else if (salaryUnclear) findings.push({ category: "薪资透明度", item: "薪资只有面议或笼统表述", level: "medium", evidence: "出现“面议、高薪、待遇优厚”等词，但没有数字区间。", suggestion: "在沟通前要求对方给出底薪、绩效、提成和试用期具体范围。" });
  if (!dutyFound) findings.push({ category: "工作内容", item: "缺少岗位职责", level: "high", evidence: "没有识别到岗位职责或工作内容段落。", suggestion: "要求补充日常任务、交付目标、汇报对象和不承担的工作边界。" });
  else if (dutyVague) findings.push({ category: "工作内容", item: "工作内容可能模糊", level: "medium", evidence: "职责较短，或出现“其他安排、服从安排”等开放式表述。", suggestion: "把高频任务、工作占比、加班场景和跨岗职责问清楚。" });
  if (!locationFound) findings.push({ category: "工作地点", item: "工作地点不明确", level: "medium", evidence: "没有识别到城市、办公地点或远程信息。", suggestion: "确认办公城市、具体区域、是否需要出差以及是否支持远程。" });
  if (!requirementsFound) findings.push({ category: "任职要求", item: "缺少任职要求", level: "low", evidence: "没有识别到学历、经验或技能要求。", suggestion: "确认硬性门槛、优先技能和不符合条件时的筛选规则。" });
  if (!hoursFound) findings.push({ category: "工作制度", item: "工作时间和加班制度缺失", level: "medium", evidence: "没有识别到双休、工作时段、加班或调休信息。", suggestion: "确认工作日、上下班时间、加班频率、加班费或调休规则。" });
  if (!benefitsFound) findings.push({ category: "福利待遇", item: "福利待遇不完整", level: "low", evidence: "没有识别到社保、公积金或其他福利信息。", suggestion: "确认社保公积金缴纳基数、试用期缴纳情况和补贴奖金。" });
  if (!employmentFound) findings.push({ category: "用工关系", item: "用工类型不清晰", level: "low", evidence: "没有识别到全职、实习、外包或合同类型。", suggestion: "确认劳动合同主体、用工类型、试用期和转正条件。" });
  if (!processFound) findings.push({ category: "招聘流程", item: "招聘流程不透明", level: "low", evidence: "没有识别到面试轮次、笔试或试用期信息。", suggestion: "提前确认面试轮次、决策人、反馈时间和试用期考核。" });
  if (has(text, /(无责底薪|纯提成|高提成)/) && !has(text, /(底薪\s*\d|\d+\s*[kK万千元])/)) findings.push({ category: "薪资透明度", item: "可能存在收入结构风险", level: "high", evidence: "出现无责底薪、纯提成或高提成，但未给出可核验的金额。", suggestion: "要求书面确认固定薪资、提成口径、发放条件和历史达成率。" });
  if (has(text, /(轻松月入|日入|无需经验.*高薪|高薪诚聘)/)) findings.push({ category: "表达风险", item: "存在营销化或夸大收入表述", level: "medium", evidence: "出现高收入承诺，但缺少岗位条件和计算方式。", suggestion: "不要只按宣传数字判断，要求对方说明收入样本、考核条件和淘汰规则。" });

  const strengths: string[] = [];
  if (salaryFound && !salaryUnclear) strengths.push("已提供数字化薪资线索");
  if (dutyFound && !dutyVague) strengths.push("岗位职责有一定具体度");
  if (locationFound) strengths.push("工作地点有线索");
  if (benefitsFound) strengths.push("福利待遇有部分说明");

  const score = Math.max(0, Math.min(100, 100 - findings.reduce((total, item) => total + (item.level === "high" ? 20 : item.level === "medium" ? 12 : 6), 0)));
  const company = companyName ? `“${companyName}”` : "这条招聘信息";
  const summary = score >= 80
    ? `${company}信息相对完整，但仍建议在沟通时核实关键条件。`
    : score >= 55
    ? `${company}存在若干需要补充确认的条件，建议不要只凭截图做决定。`
    : `${company}关键信息缺口较多，建议先补齐薪资、职责和用工条件，再决定是否推进。`;

  return { riskScore: score, summary, fields, findings, strengths };
}

function serialize(item: { resultJson: string; [key: string]: unknown }) {
  return { ...item, result: JSON.parse(item.resultJson) };
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const items = await prisma.jobAnalysis.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ items: items.map(serialize) });
  } catch (error) {
    console.error("Load analysis archives error:", error);
    return NextResponse.json({ error: "获取分析存档失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "请先登录后保存分析" }, { status: 401 });

  try {
    const body = await request.json();
    const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
    if (rawText.length < 12) return NextResponse.json({ error: "请补充至少 12 个字的招聘文字" }, { status: 400 });
    const result = analyzeText(rawText, typeof body.companyName === "string" ? body.companyName.trim() : null);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "未命名招聘分析";
    const item = await prisma.jobAnalysis.create({
      data: {
        userId,
        title,
        companyName: typeof body.companyName === "string" ? body.companyName.trim() || null : null,
        source: typeof body.source === "string" ? body.source.trim() || null : null,
        imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim() || null : null,
        rawText,
        resultJson: JSON.stringify(result),
        riskScore: result.riskScore,
      },
    });
    return NextResponse.json({ success: true, item: serialize(item), result });
  } catch (error) {
    console.error("Create analysis archive error:", error);
    return NextResponse.json({ error: "分析保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "存档参数无效" }, { status: 400 });
  await prisma.jobAnalysis.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
