import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callJobAnalysisAI, type AIAnalysisOutput } from "@/lib/ai-analysis";
import { findSimilarRecords } from "@/lib/job-similarity";

type FindingLevel = "high" | "medium" | "low";
type FieldState = "found" | "missing" | "unclear";

interface Finding {
  category: string;
  item: string;
  level: FindingLevel;
  evidence: string;
  suggestion: string;
}

interface CityReference {
  city: string;
  monthlyIncome: number;
  salaryFloor: number;
  ratio: number;
  score: number;
  level: string;
  referenceYear: number;
}

interface AnalysisResult {
  riskScore: number;
  summary: string;
  fields: Record<string, { value: string; state: FieldState }>;
  findings: Finding[];
  strengths: string[];
  cityReference?: CityReference;
  aiEnhanced?: boolean;
  aiReview?: {
    status: "complete" | "unavailable";
    summary?: string;
    differences: Array<{ fieldKey: string; ruleValue: string; aiValue: string }>;
  };
}

const editableFieldKeys = new Set([
  "salaryRange", "salaryStructure", "salaryBase", "commission", "performance", "probationCompensation", "regularCompensation", "afterTaxIncome", "estimatedGross", "estimatedTakeHome", "taskRequirement", "duties", "location", "requirements", "workTime", "dailyHours", "weeklyHours", "weeklyWorkDays", "shiftWork", "overtimePolicy", "benefits", "monthlyAllowance", "dailyAllowance", "mealAllowance", "transportAllowance", "housingAllowance", "bonus", "socialBenefits", "employment", "process",
]);

const WORDS = {
  missing: "\u672a\u5728\u6587\u5b57\u4e2d\u63d0\u53ca",
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

// Monthly urban disposable-income reference, rounded from each city's 2024 public statistical bulletin.
// It is a purchasing-power reference, not a wage standard or a personal rent estimate.
const CITY_REFERENCE: Record<string, { monthlyIncome: number; socialBaseMin: number; referenceYear: number }> = {
  "\u5317\u4eac": { monthlyIncome: 7850, socialBaseMin: 6821, referenceYear: 2024 },
  "\u4e0a\u6d77": { monthlyIncome: 7750, socialBaseMin: 7384, referenceYear: 2024 },
  "\u5e7f\u5dde": { monthlyIncome: 6900, socialBaseMin: 5284, referenceYear: 2024 },
  "\u6df1\u5733": { monthlyIncome: 6800, socialBaseMin: 6475, referenceYear: 2024 },
  "\u676d\u5dde": { monthlyIncome: 7000, socialBaseMin: 4812, referenceYear: 2024 },
  "\u5357\u4eac": { monthlyIncome: 6200, socialBaseMin: 4879, referenceYear: 2024 },
  "\u82cf\u5dde": { monthlyIncome: 6000, socialBaseMin: 4879, referenceYear: 2024 },
  "\u6210\u90fd": { monthlyIncome: 4700, socialBaseMin: 4511, referenceYear: 2024 },
  "\u6b66\u6c49": { monthlyIncome: 4700, socialBaseMin: 4233, referenceYear: 2024 },
  "\u91cd\u5e86": { monthlyIncome: 4000, socialBaseMin: 4359, referenceYear: 2024 },
  "\u897f\u5b89": { monthlyIncome: 4000, socialBaseMin: 4309, referenceYear: 2024 },
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
  return text.slice(index, index + limit).split(/[\u3002\uff1b\uff0c,;.!\uff01\uff1f]/u)[0].trim();
}

function capture(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() || "";
}

function labeledValue(text: string, label: RegExp, stop: RegExp, limit = 120) {
  const match = text.match(label);
  if (!match?.index && match?.index !== 0) return "";
  const value = text.slice(match.index + match[0].length).replace(/^[\s:：-]+/u, "");
  const stopIndex = value.search(stop);
  return value.slice(0, stopIndex >= 0 ? stopIndex : limit).replace(/[\s,，;；。]+$/u, "").trim();
}

function amountWithUnit(value: string) {
  if (!value) return "";
  return /[kK\u4e07\u5343\u5143]/u.test(value) ? value : value + " \u5143";
}

function timeToHours(value: string) {
  const [hours, minutes = "0"] = value.split(":");
  return Number(hours) + Number(minutes) / 60;
}

function amountToYuan(value: string, unit = "") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  if (/^[kK]$/u.test(unit)) return amount * 1000;
  if (unit === "\u4e07") return amount * 10000;
  if (unit === "\u5343") return amount * 1000;
  return amount;
}

function monthlySalaryFloor(value: string) {
  if (!value || /\u5e74\u85aa|\/\s*\u5e74/u.test(value)) return 0;
  const range = value.match(/(\d+(?:\.\d+)?)\s*[-~\u81f3\u5230]\s*\d+(?:\.\d+)?\s*([kK]|\u4e07|\u5343|\u5143)/u);
  if (range) return amountToYuan(range[1], range[2]);
  const amount = value.match(/(\d+(?:\.\d+)?)\s*([kK]|\u4e07|\u5343|\u5143)?/u);
  return amount ? amountToYuan(amount[1], amount[2]) : 0;
}

function cityReference(city: string, salary: string): CityReference | undefined {
  const benchmark = CITY_REFERENCE[city];
  const salaryFloor = monthlySalaryFloor(salary);
  if (!benchmark || !salaryFloor) return undefined;
  const ratio = Math.round(salaryFloor / benchmark.monthlyIncome * 100) / 100;
  const score = ratio >= 1.5 ? 20 : ratio >= 1.2 ? 16 : ratio >= 0.95 ? 12 : ratio >= 0.75 ? 7 : 3;
  const level = ratio >= 1.5 ? "\u663e\u8457\u9ad8\u4e8e\u57ce\u5e02\u751f\u6d3b\u53c2\u8003" : ratio >= 1.2 ? "\u9ad8\u4e8e\u57ce\u5e02\u751f\u6d3b\u53c2\u8003" : ratio >= 0.95 ? "\u63a5\u8fd1\u57ce\u5e02\u751f\u6d3b\u53c2\u8003" : ratio >= 0.75 ? "\u4f4e\u4e8e\u57ce\u5e02\u751f\u6d3b\u53c2\u8003" : "\u660e\u663e\u4f4e\u4e8e\u57ce\u5e02\u751f\u6d3b\u53c2\u8003";
  return { city, monthlyIncome: benchmark.monthlyIncome, salaryFloor, ratio, score, level, referenceYear: benchmark.referenceYear };
}

interface CompensationStage {
  fixed: number;
  detail: string;
  monthlyNight: number;
  mealPerDay: number;
  overnightNight: number;
}

function compensationStage(segment: string): CompensationStage | undefined {
  if (!segment) return undefined;
  const base = Number(capture(segment, /(\d+(?:\.\d+)?)\s*(?:\u57fa\u672c\u5de5\u8d44|\u65e0\u8d23\u5e95\u85aa|\u5e95\u85aa)/u) || capture(segment, /(?:\u57fa\u672c\u5de5\u8d44|\u65e0\u8d23\u5e95\u85aa|\u5e95\u85aa)[\s:：+]*([0-9]+(?:\.\d+)?)/u) || 0);
  const performance = Number(capture(segment, /(\d+(?:\.\d+)?)\s*(?:\u7ee9\u6548\u5956\u91d1|\u7ee9\u6548\u5de5\u8d44|\u7ee9\u6548)/u) || capture(segment, /(?:\u7ee9\u6548\u5956\u91d1|\u7ee9\u6548\u5de5\u8d44|\u7ee9\u6548)[\s:：+]*([0-9]+(?:\.\d+)?)/u) || 0);
  const mealPerDay = Number(capture(segment, /\u9910\u8865[^\d]{0,8}(\d+(?:\.\d+)?)\s*\u5143?\s*\/?\s*(?:\u5929|\u65e5)/u) || 0);
  const monthlyNight = Number(capture(segment, /(?:(?:\u901a\u5bb5\u73ed)?\u5c97\u8865|\u591c\u73ed\u5c97\u8865|\u591c\u73ed\u8865\u8d34)[^\d]{0,12}(\d+(?:\.\d+)?)\s*\u5143?\s*\/?\s*\u6708/u) || 0);
  const overnightNight = Number(capture(segment, /(?:(?:\u901a\u5bb5\u73ed)?\u591c\u73ed\u8865\u8d34|\u901a\u5bb5\u8865\u8d34)[^\d]{0,12}(\d+(?:\.\d+)?)\s*\u5143?\s*\/?\s*(?:\u665a|\u591c)/u) || 0);
  const fixed = base + performance + monthlyNight;
  if (!fixed && !mealPerDay && !overnightNight) return undefined;
  const items = [base ? `\u57fa\u672c\u5de5\u8d44 ${base} \u5143` : "", performance ? `\u7ee9\u6548 ${performance} \u5143` : "", monthlyNight ? `\u591c\u73ed\u5c97\u8865 ${monthlyNight} \u5143/\u6708` : ""].filter(Boolean);
  const variable = [mealPerDay ? `\u9910\u8865 ${mealPerDay} \u5143/\u5de5\u4f5c\u65e5` : "", overnightNight ? `\u901a\u5bb5\u591c\u73ed\u8865\u8d34 ${overnightNight} \u5143/\u665a` : ""].filter(Boolean);
  return { fixed, monthlyNight, mealPerDay, overnightNight, detail: `\u56fa\u5b9a ${fixed} \u5143/\u6708\uff08${items.join(" + ")}\uff09${variable.length ? `\uff1b\u53e6\u6709 ${variable.join(" + ")}` : ""}` };
}

function monthlyIndividualIncomeTax(amount: number) {
  const taxable = Math.max(0, amount - 5000);
  if (taxable <= 3000) return taxable * 0.03;
  if (taxable <= 12000) return taxable * 0.1 - 210;
  if (taxable <= 25000) return taxable * 0.2 - 1410;
  if (taxable <= 35000) return taxable * 0.25 - 2660;
  if (taxable <= 55000) return taxable * 0.3 - 4410;
  if (taxable <= 80000) return taxable * 0.35 - 7160;
  return taxable * 0.45 - 15160;
}

function takeHomeEstimate(city: string, gross: number, includesHousingFund: boolean) {
  const rule = CITY_REFERENCE[city];
  if (!rule || !gross) return "";
  const contributionBaseMin = rule.socialBaseMin;
  const contributionBaseMax = Math.max(gross, rule.socialBaseMin);
  // Employee pension, medical and unemployment contributions are approximated at 10.5%.
  const socialLow = Math.round(contributionBaseMin * 0.105);
  const socialHigh = Math.round(contributionBaseMax * 0.105);
  const housingLow = includesHousingFund ? Math.round(contributionBaseMin * 0.05) : 0;
  const housingHigh = includesHousingFund ? Math.round(contributionBaseMax * 0.12) : 0;
  const netLow = Math.round(gross - socialHigh - housingHigh - monthlyIndividualIncomeTax(gross - socialHigh - housingHigh));
  const netHigh = Math.round(gross - socialLow - housingLow - monthlyIndividualIncomeTax(gross - socialLow - housingLow));
  const range = netLow === netHigh ? `${netLow} \u5143/\u6708` : `${netLow}-${netHigh} \u5143/\u6708`;
  return `\u7ea6 ${range}\uff08\u6309 ${rule.referenceYear} \u5e74${city}\u7f34\u8d39\u57fa\u6570\u4ece\u6700\u4f4e ${contributionBaseMin} \u5143\u81f3\u5e94\u53d1\u5de5\u8d44\u3001\u4e2a\u4eba\u793e\u4fdd\u7ea6 10.5%${includesHousingFund ? "\u3001\u516c\u79ef\u91d1 5%-12%" : "\uff0c\u516c\u79ef\u91d1\u672a\u5728\u539f\u6587\u4e2d\u786e\u8ba4"}\u4f30\u7b97\uff09`;
}

function analyzeText(rawText: string, companyName?: string | null): AnalysisResult {
  const text = rawText.replace(/\s+/g, " ").trim();
  const findings: Finding[] = [];
  const fields: AnalysisResult["fields"] = {};
  const money = /\d+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)(?:\s*[-~\u81f3\u5230]\s*\d+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143))?(?:\/\u6708|\/\u5e74|\/\u5929|\/\u5c0f\u65f6)?/u;
  const labeledSalary = capture(text, /(?:\u85aa\u8d44\u5f85\u9047|\u85aa\u8d44\u8303\u56f4|\u85aa\u916c\u8303\u56f4|\u85aa\u916c|\u6708\u85aa|\u5de5\u8d44)[\s:：]*([0-9]+(?:\.\d+)?(?:\s*(?:[kK]|\u4e07|\u5343|\u5143))?(?:\s*[-~\u81f3\u5230]\s*[0-9]+(?:\.\d+)?(?:\s*(?:[kK]|\u4e07|\u5343|\u5143))?)?)/u);
  const compactSalaryRange = firstMatch(text, /\d+(?:\.\d+)?\s*[-~\u81f3\u5230]\s*\d+(?:\.\d+)?\s*[kK]\+?/u);
  const partTimeMonthlyMatch = text.match(/\u6309\s*(\d+(?:\.\d+)?)\s*\u5929[^。；;]{0,30}?(?:\u5168\u591c\u73ed)?\s*(\d+(?:\.\d+)?)\s*(?:\u5143)?/u);
  const partTimeMonthlyValue = partTimeMonthlyMatch ? `\u5168\u591c\u73ed ${partTimeMonthlyMatch[2]} \u5143/月（按 ${partTimeMonthlyMatch[1]} 天计算）` : "";
  const salaryNumber = labeledSalary || compactSalaryRange || firstMatch(text, money);
  const salaryFound = Boolean(salaryNumber) || has(text, /\u85aa\u8d44|\u5de5\u8d44|\u6708\u85aa|\u5e74\u85aa|\u85aa\u916c/u);
  const salaryUnclear = has(text, /\u9762\u8bae|\u85aa\u8d44\u53ef\u8c08|\u5f85\u9047\u4f18\u539a|\u9ad8\u85aa|\u4e30\u539a/u) && !salaryNumber;
  const salaryHasPeriod = /\/?(?:\u6708|\u5e74|\u5929|\u5c0f\u65f6)|\u6708\u85aa|\u5e74\u85aa/u.test(salaryNumber);
  const salaryRangeValue = salaryNumber ? amountWithUnit(salaryNumber) + (salaryHasPeriod ? "" : "\uff08\u8ba1\u85aa\u5468\u671f\u672a\u8bf4\u660e\uff09") : salaryUnclear ? "\u9762\u8bae/\u7b3c\u7edf\u8868\u8ff0" : WORDS.missing;
  fields.salary = { value: salaryRangeValue, state: salaryNumber ? (salaryHasPeriod ? "found" : "unclear") : salaryUnclear ? "unclear" : "missing" };
  fields.salaryRange = { value: salaryRangeValue, state: fields.salary.state };
  if (partTimeMonthlyValue) {
    fields.salary = { value: partTimeMonthlyValue, state: "found" };
    fields.salaryRange = { value: partTimeMonthlyValue, state: "found" };
  }

  // Do not treat a bare \"工作地点\" label as a location: OCR text often has no line breaks.
  const locationValue = firstMatch(text, /\u5317\u4eac(?:\u5e02)?|\u4e0a\u6d77(?:\u5e02)?|\u5e7f\u5dde(?:\u5e02)?|\u6df1\u5733(?:\u5e02)?|\u676d\u5dde(?:\u5e02)?|\u6210\u90fd(?:\u5e02)?|\u6b66\u6c49(?:\u5e02)?|\u5357\u4eac(?:\u5e02)?|\u82cf\u5dde(?:\u5e02)?|\u897f\u5b89(?:\u5e02)?|\u91cd\u5e86(?:\u5e02)?|\u8fdc\u7a0b|\u5728\u5bb6\u529e\u516c/u);
  fields.location = { value: locationValue || WORDS.missing, state: locationValue ? "found" : "missing" };

  const dutyPattern = /\u5c97\u4f4d\u804c\u8d23|\u5de5\u4f5c\u5185\u5bb9|\u4e3b\u8981\u8d1f\u8d23|\u804c\u8d23\u63cf\u8ff0|\u65e5\u5e38\u5de5\u4f5c|\u8d1f\u8d23/u;
  const nextFieldPattern = /\u5c97\u4f4d\u8981\u6c42|\u4efb\u804c\u8981\u6c42|\u5de5\u4f5c\u65f6\u95f4|\u4e0a\u73ed\u65f6\u95f4|\u6bcf\u65e5|\u6bcf\u5468|\u53cc\u4f11|\u5355\u4f11|\u5012\u73ed|\u798f\u5229|\u85aa\u8d44|\u5de5\u4f5c\u5730\u70b9|\u4e94\u9669/u;
  const dutyValue = (labeledValue(text, dutyPattern, nextFieldPattern) || snippet(text, dutyPattern)).replace(/^(?:\u5de5\u4f5c\u5185\u5bb9|\u5c97\u4f4d\u804c\u8d23)\s*/u, "").replace(/\s*\d+\s*[-、.]?\s*$/u, "");
  const dutyFound = Boolean(dutyValue);
  const dutyVague = text.length < 100 || has(text, /\u5176\u4ed6\u4e34\u65f6\u5b89\u6392|\u5b8c\u6210\u9886\u5bfc\u4ea4\u529e|\u670d\u4ece\u5b89\u6392|\u5de5\u4f5c\u5185\u5bb9\u4e0d\u9650|\u534f\u52a9\u5176\u4ed6\u5de5\u4f5c/u);
  fields.duties = { value: dutyValue || WORDS.missing, state: dutyFound ? (dutyVague ? "unclear" : "found") : "missing" };

  const requirementPattern = /\u4efb\u804c\u8981\u6c42|\u4efb\u804c\u8d44\u683c|\u5c97\u4f4d\u8981\u6c42|\u804c\u4f4d\u5173\u952e\u8bcd|\u5b66\u5386|\u7ecf\u9a8c\u8981\u6c42|\u6280\u80fd\u8981\u6c42/u;
  const requirementsValue = (labeledValue(text, requirementPattern, /\u5de5\u4f5c\u5185\u5bb9|\u5c97\u4f4d\u804c\u8d23|\u5de5\u4f5c\u65f6\u95f4|\u4e0a\u73ed\u65f6\u95f4|\u6bcf\u65e5|\u6bcf\u5468|\u798f\u5229|\u85aa\u8d44|\u5de5\u4f5c\u5730\u70b9|\u4e94\u9669|\u53cc\u4f11|\u5355\u4f11|\u5927\u5c0f\u5468|\u5012\u73ed|\u4efb\u52a1\u8981\u6c42/u) || firstMatch(text, requirementPattern)).replace(/^(?:\u5c97\u4f4d\u8981\u6c42|\u4efb\u804c\u8981\u6c42|\u804c\u4f4d\u5173\u952e\u8bcd)\s*/u, "");
  fields.requirements = { value: requirementsValue || WORDS.missing, state: requirementsValue ? "found" : "missing" };

  const clockRange = /\d{1,2}:\d{2}\s*(?:\u70b9)?\s*[-~\u81f3\u5230]\s*\d{1,2}:\d{2}\s*(?:\u70b9)?/u;
  const labeledWorkTime = capture(text, /(?:\u5de5\u4f5c\u65f6\u95f4|\u4e0a\u73ed\u65f6\u95f4|\u73ed\u6b21)[\s:：]*([0-2]?\d(?::[0-5]\d)?\s*[-~\u81f3\u5230]\s*[0-2]?\d(?::[0-5]\d)?)/u);
  const workTimeValue = labeledWorkTime || firstMatch(text, clockRange) || firstMatch(text, /\u671d\u4e5d\u665a\u516d|\u65e9\u4e5d\u665a\u516d/u);
  fields.workTime = { value: workTimeValue || WORDS.missing, state: workTimeValue ? "found" : "missing" };
  fields.hours = { value: workTimeValue || WORDS.missing, state: workTimeValue ? "found" : "missing" };

  const dailyHoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:\u5c0f\u65f6|h)(?:\s*\/\s*(?:\u5929|\u65e5))?|(?:\u6bcf\u5929|\u6bcf\u65e5)\s*(\d+(?:\.\d+)?)\s*(?:\u5c0f\u65f6|h)/iu);
  const dailyHoursValue = firstMatch(text, /(?:\u6bcf\u5929|\u6bcf\u65e5|\u65e5\u5747)\s*\d+(?:\.\d+)?\s*(?:\u5c0f\u65f6|h)|\d+(?:\.\d+)?\s*(?:\u5c0f\u65f6|h)\s*\/\s*(?:\u5929|\u65e5)|\d+(?:\.\d+)?\s*\u5c0f\u65f6\u5de5\u4f5c\u5236/iu);
  const workTimeMatch = workTimeValue.match(/(\d{1,2}(?::\d{2})?)\s*(?:\u70b9)?\s*[-~\u81f3\u5230]\s*(\d{1,2}(?::\d{2})?)\s*(?:\u70b9)?/u);
  const inferredDailyHours = workTimeMatch ? (() => {
    const start = timeToHours(workTimeMatch[1]);
    let end = timeToHours(workTimeMatch[2]);
    if (end <= start) end += workTimeValue.includes(":") ? 24 : 12;
    const hours = end - start;
    return hours > 0 && hours <= 16 ? `\u7ea6 ${hours} \u5c0f\u65f6/\u5929\uff08\u6309 ${workTimeValue} \u63a8\u7b97\uff0c\u4f11\u606f\u65f6\u95f4\u672a\u8bf4\u660e\uff09` : "";
  })() : "";
  fields.dailyHours = { value: dailyHoursValue || inferredDailyHours || WORDS.missing, state: dailyHoursValue ? "found" : inferredDailyHours ? "unclear" : "missing" };
  const weeklyHoursDirect = firstMatch(text, /(?:\u6bcf\u5468|\u5468\u5de5)\s*\d+(?:\.\d+)?\s*(?:\u5c0f\u65f6|h)|\d+(?:\.\d+)?\s*(?:\u5c0f\u65f6|h)\s*\/\s*(?:\u5468|\u5468\u5de5)/iu);
  const rotationMatch = text.match(/\u4e0a\s*([1-7])\s*(?:\u5929)?\s*\u4f11(?:\u606f)?\s*([1-7])\s*(?:\u5929)?/u);
  const weeklyDaysMatch = text.match(/(?:\u6bcf\u5468\s*)?(\d+)\s*\u5929(?:\u5de5\u4f5c)?/u);
  const weeklyDaysValue = firstMatch(text, /\u53cc\u4f11|\u5355\u4f11|\u5927\u5c0f\u5468|\u505a\u516d\u4f11\u4e00|\u6bcf\u5468\s*(?:[1-7]|[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u4e24])\s*(?:\u5929|\u65e5)/u);
  const dailyHours = dailyHoursMatch ? Number(dailyHoursMatch[1] || dailyHoursMatch[2]) : workTimeMatch ? Number(inferredDailyHours.match(/\d+(?:\.\d+)?/u)?.[0] || 0) : 0;
  const weeklyDays = rotationMatch ? 7 * Number(rotationMatch[1]) / (Number(rotationMatch[1]) + Number(rotationMatch[2])) : weeklyDaysMatch ? Number(weeklyDaysMatch[1]) : weeklyDaysValue === "\u53cc\u4f11" ? 5 : weeklyDaysValue === "\u5355\u4f11" ? 6 : 0;
  const weeklyHoursValue = weeklyHoursDirect || (dailyHours && weeklyDays ? "\u7ea6 " + Math.round(dailyHours * weeklyDays * 10) / 10 + " \u5c0f\u65f6/\u5468\uff08\u6309\u6bcf\u65e5\u65f6\u95f4\u4e0e\u4f11\u606f\u65e5\u63a8\u7b97\uff0c\u4f11\u606f\u65f6\u95f4\u672a\u8bf4\u660e\uff09" : "");
  fields.weeklyHours = { value: weeklyHoursValue || WORDS.missing, state: weeklyHoursDirect ? "found" : weeklyHoursValue ? "unclear" : "missing" };
  fields.weeklyWorkDays = { value: rotationMatch ? `上${rotationMatch[1]}休${rotationMatch[2]}（轮换，约 ${weeklyDays} 天/周）` : weeklyDaysValue || (weeklyDaysMatch ? "\u6bcf\u5468 " + weeklyDaysMatch[1] + " \u5929" : WORDS.missing), state: rotationMatch ? "unclear" : weeklyDaysValue || weeklyDaysMatch ? "found" : "missing" };
  const shiftValue = firstMatch(text, /(?:\u4f1a|\u9700\u8981|\u53ef\u80fd)?\s*(?:\u6d89\u53ca)?(?:\u5012\u73ed|\u8f6e\u73ed|\u6392\u73ed|\u4e24\u73ed\u5012|\u4e09\u73ed\u5012|\u65e9\u665a\u73ed|\u767d\u591c\u73ed|\u591c\u73ed|\u4e0d\u5012\u73ed|\u65e0\u591c\u73ed)/u);
  fields.shiftWork = { value: shiftValue || WORDS.missing, state: shiftValue ? "found" : "missing" };
  const overtimePattern = /\u4e0d\u52a0\u73ed|\u65e0\u52a0\u73ed|\u5e38\u6001\u52a0\u73ed|\u8c03\u4f11|\u52a0\u73ed\u8d39|\u52a0\u73ed\u9891\u7387/u;
  const overtimeValue = firstMatch(text, overtimePattern);
  fields.overtimePolicy = { value: overtimeValue || WORDS.missing, state: overtimeValue ? "found" : "missing" };

  const benefitsValue = firstMatch(text, /\u4e94\u9669\u4e00\u91d1|\u4e94\u9669|\u793e\u4fdd|\u516c\u79ef\u91d1|\u5e26\u85aa\u5e74\u5047|\u5e74\u7ec8\u5956|\u9910\u8865|\u623f\u8865|\u8f66\u8865/u);
  fields.benefits = { value: benefitsValue || WORDS.missing, state: benefitsValue ? "found" : "missing" };
  const benefitDetail = [
    has(text, /\u9910\u8865/u) ? "餐补" : "",
    has(text, /\u805a\u9910/u) ? "按月不定期聚餐" : "",
    firstMatch(text, /\u751f\u65e5\u7ea2\u5305\s*\d+(?:\.\d+)?\s*\u5143/u),
    firstMatch(text, /(?:\u5973\u795e|\u7aef\u5348|\u4e2d\u79cb|\u6625\u8282)[^。；;]{0,50}(?:\u7ea2\u5305|\u793c\u7269)/u),
  ].filter(Boolean).join("；");
  if (benefitDetail) fields.benefits = { value: benefitDetail, state: "found" };

  const employmentValue = firstMatch(text, /\u5168\u804c|\u517c\u804c|\u5b9e\u4e60|\u52b3\u52a1|\u52b3\u52a8\u5408\u540c|\u6b63\u5f0f|\u793e\u62db|\u6821\u62db|\u5916\u5305/u);
  fields.employment = { value: employmentValue || WORDS.missing, state: employmentValue ? "found" : "missing" };
  const contractingPlatform = firstMatch(text, /(?:\u7531)?[^，。；;]{0,20}?(?:\u7075\u5de5\u5e73\u53f0|\u4f17\u5305\u5e73\u53f0|\u5916\u5305\u5e73\u53f0)[^，。；;]{0,28}(?:\u7b7e\u7ea6|\u53d1\u653e\u62a5\u916c)/u);
  if (contractingPlatform) fields.employment = { value: [employmentValue, contractingPlatform].filter(Boolean).join("；"), state: "found" };

  const processValue = firstMatch(text, /\u9762\u8bd5|\u7b14\u8bd5|\d+\s*\u8f6e\u9762\u8bd5|\u5165\u804c\u65f6\u95f4|\u8bd5\u7528\u671f/u);
  fields.process = { value: processValue || WORDS.missing, state: processValue ? "found" : "missing" };
  const trainingDetail = firstMatch(text, /\u57f9\u8bad\u671f[^。；;]{0,180}/u);
  if (trainingDetail) fields.process = { value: trainingDetail, state: "found" };

  const allowancePattern = /\u8865\u8d34|\u8865\u52a9/u;
  const baseAmount = capture(text, /(\d+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)\s*(?:\u57fa\u672c\u5de5\u8d44|\u65e0\u8d23\u5e95\u85aa|\u65e0\u8d23\u5e95\u85aa|\u56fa\u5b9a\u5de5\u8d44|\u5e95\u85aa)/u) || capture(text, /(?:\u57fa\u672c\u5de5\u8d44|\u65e0\u8d23\u5e95\u85aa|\u65e0\u8d23\u5e95\u85aa|\u56fa\u5b9a\u5de5\u8d44|\u5e95\u85aa)[\s:：]*([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)/u);
  const commissionAmount = capture(text, /(\d+(?:\.\d+)?\s*(?:%|\u4e2a\u70b9|\u70b9))\s*(?:\u63d0\u6210|\u9500\u552e\u63d0\u6210)/u) || capture(text, /(?:\u63d0\u6210|\u9500\u552e\u63d0\u6210)[\s:：]*([0-9]+(?:\.\d+)?\s*(?:%|\u4e2a\u70b9|\u70b9)?)/u);
  const performanceAmount = capture(text, /(\d+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)\s*(?:\u7ee9\u6548\u5956\u91d1|\u7ee9\u6548\u5de5\u8d44|\u7ee9\u6548)/u) || capture(text, /(?:\u7ee9\u6548\u5956\u91d1|\u7ee9\u6548\u5de5\u8d44|\u7ee9\u6548)[\s:：]*([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)/u);
  const baseValue = baseAmount ? "\u57fa\u672c\u5de5\u8d44 " + amountWithUnit(baseAmount) : "";
  const commissionValue = commissionAmount ? "\u63d0\u6210 " + commissionAmount : "";
  const performanceValue = performanceAmount ? "\u7ee9\u6548 " + amountWithUnit(performanceAmount) : "";
  const salaryComponents = [baseValue, performanceValue, commissionValue].filter(Boolean).join(" + ");
  const probationStage = compensationStage(labeledValue(text, /\u8bd5\u7528\u671f[\s:：]*/u, /\u8f6c\u6b63|\u8f6c\u6b63\u540e|\u6b63\u5f0f\u671f/u, 280));
  const regularStage = compensationStage(labeledValue(text, /(?:\u8f6c\u6b63\u540e?|\u6b63\u5f0f\u671f)[\s:：]*/u, /\u5de5\u4f5c\u5185\u5bb9|\u5c97\u4f4d\u804c\u8d23|\u4efb\u804c\u8981\u6c42/u, 280));
  const stageSummary = [probationStage ? `\u8bd5\u7528\u671f\uff1a${probationStage.detail}` : "", regularStage ? `\u8f6c\u6b63\uff1a${regularStage.detail}` : ""].filter(Boolean).join("\uff1b");
  fields.salaryStructure = { value: stageSummary || salaryComponents || WORDS.missing, state: stageSummary || salaryComponents ? "found" : "missing" };
  fields.salaryBase = { value: baseValue || WORDS.missing, state: baseValue ? (money.test(baseValue) ? "found" : "unclear") : "missing" };
  fields.commission = { value: commissionValue || WORDS.missing, state: commissionValue ? (money.test(commissionValue) || has(commissionValue, /\d+\s*%/u) ? "found" : "unclear") : "missing" };
  fields.performance = { value: performanceValue || WORDS.missing, state: performanceValue ? (money.test(performanceValue) ? "found" : "unclear") : "missing" };
  fields.probationCompensation = { value: probationStage?.detail || WORDS.missing, state: probationStage ? "found" : "missing" };
  fields.regularCompensation = { value: regularStage?.detail || WORDS.missing, state: regularStage ? "found" : "missing" };
  const afterTaxStages = [probationStage ? `\u8bd5\u7528\u671f\u4e2a\u7a0e\u540e\u56fa\u5b9a\u7ea6 ${Math.round(probationStage.fixed - monthlyIndividualIncomeTax(probationStage.fixed))} \u5143/\u6708` : "", regularStage ? `\u8f6c\u6b63\u4e2a\u7a0e\u540e\u56fa\u5b9a\u7ea6 ${Math.round(regularStage.fixed - monthlyIndividualIncomeTax(regularStage.fixed))} \u5143/\u6708` : ""].filter(Boolean);
  fields.afterTaxIncome = { value: afterTaxStages.length ? `${afterTaxStages.join("\uff1b")}\uff08\u672a\u6263\u793e\u4fdd/\u516c\u79ef\u91d1\uff0c\u9910\u8865\u4e0e\u6309\u665a\u8865\u8d34\u53e6\u8ba1\uff09` : WORDS.missing, state: afterTaxStages.length ? "unclear" : "missing" };
  const taskRequirementValue = firstMatch(text, /\u6ca1\u6709\u4efb\u52a1\u8981\u6c42|\u65e0\u4efb\u52a1\u8981\u6c42|\u4e0d\u8bbe\u4efb\u52a1|\u65e0\u4e1a\u7ee9\u8981\u6c42|\u4e0d\u8003\u6838|\u4efb\u52a1\u6307\u6807[^\u3002\uff1b;.!?\uff01\uff1f]{0,40}/u);
  fields.taskRequirement = { value: taskRequirementValue || WORDS.missing, state: taskRequirementValue ? "found" : "missing" };

  const monthlyAllowanceAmount = capture(text, /(?:\u6bcf\u6708|\u6bcf\u4e2a\u6708|\u6708\u5ea6)\s*(?:\u8865\u8d34|\u8865\u52a9)?[\s:：]*([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)/u) || capture(text, /([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)\s*(?:\/\s*\u6708)?\s*(?:\u6708\u8865\u8d34|\u6708\u5ea6\u8865\u8d34|\u6bcf\u6708\u8865\u8d34)/u);
  const dailyAllowanceAmount = capture(text, /(?:\u6bcf\u5929|\u6bcf\u65e5|\u65e5)\s*(?:\u8865\u8d34|\u8865\u52a9)?[\s:：]*([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)/u) || capture(text, /([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)\s*(?:\/\s*\u5929)?\s*(?:\u65e5\u8865\u8d34|\u6bcf\u65e5\u8865\u8d34|\u6bcf\u5929\u8865\u8d34)/u);
  const mealAmount = capture(text, /(?:\u9910\u8865|\u996d\u8865|\u9965\u98df\u8865\u8d34|\u9910\u8d39\u8865\u8d34)[\s:：]*([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)/u);
  const transportAmount = capture(text, /(?:\u4ea4\u901a\u8865\u8d34|\u8f66\u8865|\u4ea4\u901a\u8d39|\u8f66\u8d39\u8865\u8d34)[\s:：]*([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)/u);
  const housingAmount = capture(text, /(?:\u623f\u8865|\u4f4f\u623f\u8865\u8d34|\u4f4f\u5bbf\u8865\u8d34)[\s:：]*([0-9]+(?:\.\d+)?\s*(?:[kK]|\u4e07|\u5343|\u5143)?)/u);
  const stageMonthlyNight = Math.max(probationStage?.monthlyNight || 0, regularStage?.monthlyNight || 0);
  const stageMealPerDay = Math.max(probationStage?.mealPerDay || 0, regularStage?.mealPerDay || 0);
  const stageOvernightNight = Math.max(probationStage?.overnightNight || 0, regularStage?.overnightNight || 0);
  const monthlyAllowanceValue = monthlyAllowanceAmount ? `每月补贴 ${amountWithUnit(monthlyAllowanceAmount)}` : stageMonthlyNight ? `夜班岗补 ${stageMonthlyNight} 元/月` : "";
  const dailyAllowanceItems = [dailyAllowanceAmount ? `每天补贴 ${amountWithUnit(dailyAllowanceAmount)}` : "", stageMealPerDay ? `餐补 ${stageMealPerDay} 元/工作日` : "", stageOvernightNight ? `通宵夜班补贴 ${stageOvernightNight} 元/晚` : ""].filter(Boolean);
  const dailyAllowanceValue = dailyAllowanceItems.join(" + ");
  const mealValue = mealAmount ? `食补 ${amountWithUnit(mealAmount)}` : stageMealPerDay ? `食补 ${stageMealPerDay} 元/工作日` : "";
  const transportValue = transportAmount ? `交通补贴 ${amountWithUnit(transportAmount)}` : "";
  const housingValue = housingAmount ? `房补 ${amountWithUnit(housingAmount)}` : "";
  const bonusValue = firstMatch(text, /\u5e74\u7ec8\u5956|\u5e74\u5ea6\u5956\u91d1|\u5341\u4e09\u85aa|\u5341\u56db\u85aa/u);
  const socialValue = firstMatch(text, /\u4e94\u9669\u4e00\u91d1|\u4e94\u9669|\u793e\u4fdd|\u516c\u79ef\u91d1/u);
  fields.monthlyAllowance = { value: monthlyAllowanceValue || WORDS.missing, state: monthlyAllowanceValue ? "found" : "missing" };
  fields.dailyAllowance = { value: dailyAllowanceValue || WORDS.missing, state: dailyAllowanceValue ? "found" : "missing" };
  fields.mealAllowance = { value: mealValue || WORDS.missing, state: mealValue ? "found" : "missing" };
  fields.transportAllowance = { value: transportValue || WORDS.missing, state: transportValue ? "found" : "missing" };
  fields.housingAllowance = { value: housingValue || WORDS.missing, state: housingValue ? "found" : "missing" };
  fields.bonus = { value: bonusValue || WORDS.missing, state: bonusValue ? "found" : "missing" };
  fields.socialBenefits = { value: socialValue || WORDS.missing, state: socialValue ? "found" : "missing" };
  const hourlyRate = capture(text, /(\d+(?:\.\d+)?)\s*\u5143\s*\/?\s*\u5c0f\u65f6/u);
  const hourlyBase = capture(text, /\u57fa\u672c(?:\u6536\u5165|\u5de5\u8d44)[\s:：]*(\d+(?:\.\d+)?)\s*\u5143/u);
  const hourlyMeal = capture(text, /(\d+(?:\.\d+)?)\s*\u5143?\s*(?:\u4ea4)?\u9910\u8865/u);
  const monthlyFloatingAward = capture(text, /(\d+(?:\.\d+)?)\s*\u5143?\s*\u6d6e\u52a8\u5956/u);
  const shiftAllowance = capture(text, /(?:\u73ed\u6b21\u8865\u8d34|\u591c\u73ed\u8865\u8d34)[^。；;]{0,12}?(\d+(?:\.\d+)?)\s*\u5143\s*\/?\s*\u6b21/u);
  const milestoneRewards = [
    firstMatch(text, /\u4e0a\u7ebf\u6ee1\s*30\s*\u5929\u5956\u52b1\s*\d+(?:\.\d+)?\s*\u5143/u),
    firstMatch(text, /\u4e0a\u7ebf\u6ee1\s*4\s*\u4e2a\u6708\u5956\u52b1\s*\d+(?:\.\d+)?\s*\u5143/u),
  ].filter(Boolean).join("；");
  if (hourlyRate) {
    const hourlyComponents = [
      hourlyBase ? `基本收入 ${hourlyBase} 元/小时` : "",
      hourlyMeal ? `餐补 ${hourlyMeal} 元/小时（计入时薪）` : "",
      monthlyFloatingAward ? `浮动奖 ${monthlyFloatingAward} 元/月（业务和考勤）` : "",
      shiftAllowance ? `夜班班次补贴 ${shiftAllowance} 元/次` : "",
    ].filter(Boolean).join(" + ");
    fields.salaryStructure = { value: `兼职时薪 ${hourlyRate} 元/小时${hourlyComponents ? `：${hourlyComponents}` : ""}`, state: "found" };
    fields.salaryBase = { value: hourlyBase ? `基本收入 ${hourlyBase} 元/小时` : `时薪 ${hourlyRate} 元/小时`, state: "found" };
    if (monthlyFloatingAward) fields.performance = { value: `浮动奖 ${monthlyFloatingAward} 元/月（业务和考勤）`, state: "unclear" };
    if (shiftAllowance) fields.dailyAllowance = { value: `夜班班次补贴 ${shiftAllowance} 元/次`, state: "found" };
    if (hourlyMeal) fields.mealAllowance = { value: `餐补 ${hourlyMeal} 元/小时（已计入时薪）`, state: "found" };
    if (milestoneRewards) fields.bonus = { value: `阶段奖励：${milestoneRewards}`, state: "found" };
  }
  const withHousingFund = /\u4e94\u9669\u4e00\u91d1|\u516c\u79ef\u91d1/u.test(socialValue);
  const monthlyRestDays = Number(capture(text, /\u6708\u4f11\s*(\d+(?:\.\d+)?)\s*\u5929/u) || 0);
  const scheduledDays = monthlyRestDays ? Math.max(0, 30 - monthlyRestDays) : rotationMatch ? Math.round(30 * Number(rotationMatch[1]) / (Number(rotationMatch[1]) + Number(rotationMatch[2])) * 10) / 10 : weeklyDays ? Math.round(weeklyDays * 52 / 12 * 10) / 10 : 0;
  const overnightSchedule = /\u591c\u73ed|\u901a\u5bb5/u.test(shiftValue);
  const stageGross = (stage: CompensationStage) => stage.fixed + scheduledDays * (stage.mealPerDay + (overnightSchedule ? stage.overnightNight : 0));
  const probationGross = probationStage ? stageGross(probationStage) : 0;
  const regularGross = regularStage ? stageGross(regularStage) : 0;
  const grossStages = [probationStage ? `\u8bd5\u7528\u671f\u7a0e\u524d\u7ea6 ${Math.round(probationGross)} \u5143/\u6708` : "", regularStage ? `\u8f6c\u6b63\u540e\u7a0e\u524d\u7ea6 ${Math.round(regularGross)} \u5143/\u6708` : ""].filter(Boolean);
  fields.estimatedGross = { value: grossStages.length ? `${grossStages.join("\uff1b")}\uff08\u6309${scheduledDays || "\u672a\u77e5"}\u4e2a\u5de5\u4f5c\u65e5/\u6708\u3001\u9910\u8865\u4e0e\u901a\u5bb5\u73ed\u8865\u8d34\u8ba1\u5165\uff09` : WORDS.missing, state: grossStages.length && scheduledDays ? "unclear" : "missing" };
  if (partTimeMonthlyValue) fields.estimatedGross = { value: `招聘方口径：${partTimeMonthlyValue}，未说明是否已扣除个税或其他费用`, state: "unclear" };
  const salaryStageLabel = (name: string, stage: CompensationStage) => {
    const variable = [stage.mealPerDay ? `\u9910\u8865 ${stage.mealPerDay} \u5143/\u5de5\u4f5c\u65e5` : "", stage.overnightNight ? `\u901a\u5bb5\u591c\u73ed\u8865\u8d34 ${stage.overnightNight} \u5143/\u665a` : ""].filter(Boolean).join(" + ");
    return scheduledDays ? `${name}\u7ea6 ${Math.round(stageGross(stage))} \u5143/\u6708\uff08\u56fa\u5b9a ${stage.fixed} + \u6309 ${scheduledDays} \u4e2a\u5de5\u4f5c\u65e5\u4f30\u7b97\u8865\u8d34\uff09` : `${name}\u56fa\u5b9a ${stage.fixed} \u5143/\u6708${variable ? `\uff1b\u53e6\u6709 ${variable}` : ""}`;
  };
  const stagedSalaryRange = [probationStage ? salaryStageLabel("\u8bd5\u7528\u671f", probationStage) : "", regularStage ? salaryStageLabel("\u8f6c\u6b63\u540e", regularStage) : ""].filter(Boolean).join("\uff1b");
  if (stagedSalaryRange) {
    fields.salary = { value: stagedSalaryRange, state: "unclear" };
    fields.salaryRange = { value: stagedSalaryRange, state: "unclear" };
  }
  const cityLiving = cityReference(locationValue, String(regularGross || probationGross || regularStage?.fixed || probationStage?.fixed || salaryNumber));
  const takeHomeStages = socialValue && CITY_REFERENCE[locationValue] ? [probationStage ? `\u8bd5\u7528\u671f\u9884\u4f30\u5230\u624b ${takeHomeEstimate(locationValue, probationGross, withHousingFund)}` : "", regularStage ? `\u8f6c\u6b63\u540e\u9884\u4f30\u5230\u624b ${takeHomeEstimate(locationValue, regularGross, withHousingFund)}` : ""].filter(Boolean) : [];
  fields.estimatedTakeHome = { value: takeHomeStages.length ? takeHomeStages.join("\uff1b") : WORDS.missing, state: takeHomeStages.length ? "unclear" : "missing" };

  if (!salaryFound) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u7f3a\u5c11\u660e\u786e\u7684\u85aa\u8d44\u8303\u56f4", level: "high", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u6708\u85aa\u3001\u5e74\u85aa\u6216\u85aa\u8d44\u533a\u95f4\u3002", suggestion: "\u786e\u8ba4\u6708\u85aa/\u5e74\u85aa\u8303\u56f4\u3001\u56fa\u5b9a\u85aa\u8d44\u3001\u7ee9\u6548\u63d0\u6210\u548c\u8bd5\u7528\u671f\u85aa\u8d44\u3002" });
  else if (salaryUnclear) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u85aa\u8d44\u53ea\u6709\u9762\u8bae\u6216\u7b3c\u7edf\u8868\u8ff0", level: "medium", evidence: `\u8bc6\u522b\u5230\uff1a${fields.salary.value}\uff0c\u4f46\u6ca1\u6709\u5177\u4f53\u6570\u5b57\u3002`, suggestion: "\u8981\u6c42\u5bf9\u65b9\u7ed9\u51fa\u5e95\u85aa\u3001\u7ee9\u6548\u3001\u63d0\u6210\u548c\u8bd5\u7528\u671f\u7684\u5177\u4f53\u8303\u56f4\u3002" });
  if (!dutyFound) findings.push({ category: "\u5de5\u4f5c\u5185\u5bb9", item: "\u7f3a\u5c11\u5c97\u4f4d\u804c\u8d23", level: "high", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u5c97\u4f4d\u804c\u8d23\u6216\u5de5\u4f5c\u5185\u5bb9\u6bb5\u843d\u3002", suggestion: "\u8981\u6c42\u8865\u5145\u65e5\u5e38\u4efb\u52a1\u3001\u4ea4\u4ed8\u76ee\u6807\u3001\u6c47\u62a5\u5bf9\u8c61\u548c\u5de5\u4f5c\u8fb9\u754c\u3002" });
  else if (dutyVague) findings.push({ category: "\u5de5\u4f5c\u5185\u5bb9", item: "\u5de5\u4f5c\u5185\u5bb9\u53ef\u80fd\u6a21\u7cca", level: "medium", evidence: `\u8bc6\u522b\u5230\uff1a${fields.duties.value}`, suggestion: "\u628a\u9ad8\u9891\u4efb\u52a1\u3001\u5de5\u4f5c\u5360\u6bd4\u3001\u52a0\u73ed\u573a\u666f\u548c\u8de8\u5c97\u804c\u8d23\u95ee\u6e05\u695a\u3002" });
  if (!locationValue) findings.push({ category: "\u5de5\u4f5c\u5730\u70b9", item: "\u5de5\u4f5c\u5730\u70b9\u4e0d\u660e\u786e", level: "medium", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u57ce\u5e02\u3001\u529e\u516c\u5730\u70b9\u6216\u8fdc\u7a0b\u4fe1\u606f\u3002", suggestion: "\u786e\u8ba4\u529e\u516c\u57ce\u5e02\u3001\u5177\u4f53\u533a\u57df\u3001\u662f\u5426\u51fa\u5dee\u4ee5\u53ca\u662f\u5426\u652f\u6301\u8fdc\u7a0b\u3002" });
  if (!requirementsValue) findings.push({ category: "\u4efb\u804c\u8981\u6c42", item: "\u7f3a\u5c11\u4efb\u804c\u8981\u6c42", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u5b66\u5386\u3001\u7ecf\u9a8c\u6216\u6280\u80fd\u8981\u6c42\u3002", suggestion: "\u786e\u8ba4\u786c\u6027\u95e8\u69db\u3001\u4f18\u5148\u6280\u80fd\u548c\u7b5b\u9009\u89c4\u5219\u3002" });
  if (!workTimeValue) findings.push({ category: "\u5de5\u4f5c\u5236\u5ea6", item: "\u5de5\u4f5c\u65f6\u95f4\u672a\u8bf4\u660e", level: "medium", evidence: "\u672a\u5728\u6587\u5b57\u4e2d\u8bc6\u522b\u5230\u4e0a\u4e0b\u73ed\u65f6\u95f4\u3001\u73ed\u6b21\u6216\u5de5\u4f5c\u65f6\u6bb5\u3002", suggestion: "\u786e\u8ba4\u6bcf\u5929\u5b9e\u9645\u5de5\u4f5c\u65f6\u6bb5\u3001\u4f11\u606f\u65f6\u95f4\u548c\u662f\u5426\u5b58\u5728\u7279\u6b8a\u73ed\u6b21\u3002" });
  if (!dailyHoursValue) findings.push({ category: "\u5de5\u4f5c\u5236\u5ea6", item: "\u6bcf\u65e5\u5de5\u4f5c\u5c0f\u65f6\u672a\u8bf4\u660e", level: "low", evidence: "\u672a\u5728\u6587\u5b57\u4e2d\u8bc6\u522b\u6bcf\u5929\u5b9e\u9645\u5de5\u4f5c\u5c0f\u65f6\u3002", suggestion: "\u786e\u8ba4\u6bcf\u65e5\u5de5\u4f5c\u5c0f\u65f6\u3001\u5348\u4f11\u662f\u5426\u8ba1\u5165\u3001\u4ee5\u53ca\u662f\u5426\u5b58\u5728\u9690\u5f62\u5ef6\u65f6\u3002" });
  if (!weeklyHoursValue) findings.push({ category: "\u5de5\u4f5c\u5236\u5ea6", item: "\u6bcf\u5468\u5de5\u65f6\u672a\u8bf4\u660e", level: "medium", evidence: "\u672a\u5728\u6587\u5b57\u4e2d\u8bc6\u522b\u5230\u6bcf\u5468\u5de5\u65f6\u3002", suggestion: "\u786e\u8ba4\u6bcf\u5468\u5b9e\u9645\u5de5\u4f5c\u5c0f\u65f6\uff0c\u4ee5\u53ca\u4f11\u606f\u65e5\u662f\u5426\u8ba1\u5165\u5de5\u65f6\u3002" });
  if (!rotationMatch && !weeklyDaysValue && !weeklyDaysMatch) findings.push({ category: "\u5de5\u4f5c\u5236\u5ea6", item: "\u6bcf\u5468\u5de5\u4f5c\u5929\u6570\u672a\u8bf4\u660e", level: "medium", evidence: "\u672a\u5728\u6587\u5b57\u4e2d\u8bc6\u522b\u53cc\u4f11\u3001\u5927\u5c0f\u5468\u6216\u6bcf\u5468\u5de5\u4f5c\u5929\u6570\u3002", suggestion: "\u786e\u8ba4\u6bcf\u5468\u4e0a\u73ed\u51e0\u5929\u3001\u662f\u5426\u5927\u5c0f\u5468\u6216\u6708\u4f11\u3002" });
  if (!shiftValue) findings.push({ category: "\u5de5\u4f5c\u5236\u5ea6", item: "\u5012\u73ed\u8981\u6c42\u672a\u8bf4\u660e", level: "medium", evidence: "\u672a\u5728\u6587\u5b57\u4e2d\u8bc6\u522b\u5012\u73ed\u3001\u591c\u73ed\u6216\u65e0\u5012\u73ed\u8bf4\u660e\u3002", suggestion: "\u786e\u8ba4\u662f\u5426\u8f6e\u73ed\u3001\u65e9\u665a\u73ed\u65f6\u6bb5\u3001\u591c\u73ed\u9891\u7387\u548c\u591c\u73ed\u8865\u8d34\u3002" });
  if (!overtimeValue) findings.push({ category: "\u5de5\u4f5c\u5236\u5ea6", item: "\u52a0\u73ed\u653f\u7b56\u672a\u8bf4\u660e", level: "low", evidence: "\u672a\u5728\u6587\u5b57\u4e2d\u8bc6\u522b\u52a0\u73ed\u3001\u8c03\u4f11\u6216\u52a0\u73ed\u8d39\u89c4\u5219\u3002", suggestion: "\u8ffd\u95ee\u52a0\u73ed\u662f\u5426\u5e38\u6001\u3001\u662f\u5426\u8ba1\u85aa\u6216\u8c03\u4f11\u3002" });
  if (!baseValue) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u57fa\u672c\u5de5\u8d44/\u65e0\u8d23\u5e95\u85aa\u672a\u8bf4\u660e", level: "high", evidence: "\u672a\u8bc6\u522b\u5230\u57fa\u672c\u5de5\u8d44\u6216\u65e0\u8d23\u5e95\u85aa\u53ca\u5176\u91d1\u989d\u3002", suggestion: "\u786e\u8ba4\u56fa\u5b9a\u5e95\u85aa\u91d1\u989d\u3001\u662f\u5426\u65e0\u8d23\u5e95\u85aa\u3001\u8bd5\u7528\u671f\u662f\u5426\u4e00\u81f4\u3002" });
  if (!commissionValue) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u63d0\u6210\u89c4\u5219\u672a\u8bf4\u660e", level: "medium", evidence: "\u672a\u8bc6\u522b\u5230\u63d0\u6210\u6bd4\u4f8b\u3001\u8ba1\u7b97\u53e3\u5f84\u6216\u53d1\u653e\u6761\u4ef6\u3002", suggestion: "\u786e\u8ba4\u63d0\u6210\u6309\u56de\u6b3e\u3001\u9500\u552e\u989d\u8fd8\u662f\u6bdb\u5229\u8ba1\u7b97\uff0c\u5e76\u786e\u8ba4\u53d1\u653e\u65f6\u70b9\u3002" });
  if (!performanceValue) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u7ee9\u6548\u89c4\u5219\u672a\u8bf4\u660e", level: "low", evidence: "\u672a\u8bc6\u522b\u5230\u7ee9\u6548\u91d1\u989d\u3001\u8ba1\u7b97\u89c4\u5219\u6216\u8fbe\u6210\u6807\u51c6\u3002", suggestion: "\u8ffd\u95ee\u7ee9\u6548\u5360\u6bd4\u3001\u8003\u6838\u5468\u671f\u3001\u53d1\u653e\u4e0a\u9650\u548c\u5386\u53f2\u8fbe\u6210\u7387\u3002" });
  if (!monthlyAllowanceValue && !dailyAllowanceValue && !allowancePattern.test(text)) findings.push({ category: "\u798f\u5229\u5f85\u9047", item: "\u8865\u8d34\u660e\u7ec6\u672a\u8bf4\u660e", level: "low", evidence: "\u672a\u8bc6\u522b\u5230\u6bcf\u6708\u3001\u6bcf\u5929\u6216\u6309\u9879\u76ee\u8ba1\u7b97\u7684\u8865\u8d34\u3002", suggestion: "\u5206\u522b\u786e\u8ba4\u6bcf\u6708\u8865\u8d34\u3001\u6bcf\u5929\u8865\u8d34\u3001\u9910\u8865\u3001\u8f66\u8d39\u548c\u623f\u8865\u3002" });
  if (!mealValue) findings.push({ category: "\u798f\u5229\u5f85\u9047", item: "\u98df\u8865\u672a\u8bf4\u660e", level: "low", evidence: "\u672a\u8bc6\u522b\u5230\u9910\u8865\u3001\u996d\u8865\u6216\u4f19\u98df\u8865\u8d34\u3002", suggestion: "\u786e\u8ba4\u662f\u5426\u63d0\u4f9b\u98df\u5802\u3001\u9910\u8865\u91d1\u989d\u548c\u53d1\u653e\u65b9\u5f0f\u3002" });
  if (!transportValue) findings.push({ category: "\u798f\u5229\u5f85\u9047", item: "\u8f66\u8d39/\u4ea4\u901a\u8865\u8d34\u672a\u8bf4\u660e", level: "low", evidence: "\u672a\u8bc6\u522b\u5230\u8f66\u8865\u3001\u4ea4\u901a\u8d39\u6216\u51fa\u884c\u62a5\u9500\u3002", suggestion: "\u786e\u8ba4\u662f\u5426\u6709\u8f66\u8d39\u3001\u516c\u4ea4\u8865\u8d34\u3001\u51fa\u5dee\u62a5\u9500\u53ca\u62a5\u9500\u6807\u51c6\u3002" });
  if (!benefitsValue) findings.push({ category: "\u798f\u5229\u5f85\u9047", item: "\u798f\u5229\u5f85\u9047\u4e0d\u5b8c\u6574", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u793e\u4fdd\u3001\u516c\u79ef\u91d1\u6216\u5176\u4ed6\u798f\u5229\u4fe1\u606f\u3002", suggestion: "\u786e\u8ba4\u793e\u4fdd\u516c\u79ef\u91d1\u7f34\u7eb3\u57fa\u6570\u3001\u8bd5\u7528\u671f\u7f34\u7eb3\u60c5\u51b5\u548c\u8865\u8d34\u5956\u91d1\u3002" });
  if (!employmentValue) findings.push({ category: "\u7528\u5de5\u5173\u7cfb", item: "\u7528\u5de5\u7c7b\u578b\u4e0d\u6e05\u6670", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u5168\u804c\u3001\u5b9e\u4e60\u3001\u5916\u5305\u6216\u5408\u540c\u7c7b\u578b\u3002", suggestion: "\u786e\u8ba4\u52b3\u52a8\u5408\u540c\u4e3b\u4f53\u3001\u7528\u5de5\u7c7b\u578b\u3001\u8bd5\u7528\u671f\u548c\u8f6c\u6b63\u6761\u4ef6\u3002" });
  if (!processValue) findings.push({ category: "\u62db\u8058\u6d41\u7a0b", item: "\u62db\u8058\u6d41\u7a0b\u4e0d\u900f\u660e", level: "low", evidence: "\u6ca1\u6709\u8bc6\u522b\u5230\u9762\u8bd5\u8f6e\u6b21\u3001\u7b14\u8bd5\u6216\u8bd5\u7528\u671f\u4fe1\u606f\u3002", suggestion: "\u786e\u8ba4\u9762\u8bd5\u8f6e\u6b21\u3001\u51b3\u7b56\u4eba\u3001\u53cd\u9988\u65f6\u95f4\u548c\u8bd5\u7528\u671f\u8003\u6838\u3002" });
  if (has(text, /\u65e0\u8d23\u5e95\u85aa|\u7eaf\u63d0\u6210|\u9ad8\u63d0\u6210/u) && !salaryNumber) findings.push({ category: "\u85aa\u8d44\u900f\u660e\u5ea6", item: "\u53ef\u80fd\u5b58\u5728\u6536\u5165\u7ed3\u6784\u98ce\u9669", level: "high", evidence: "\u51fa\u73b0\u65e0\u8d23\u5e95\u85aa\u3001\u7eaf\u63d0\u6210\u6216\u9ad8\u63d0\u6210\uff0c\u4f46\u672a\u7ed9\u51fa\u91d1\u989d\u3002", suggestion: "\u8981\u6c42\u4e66\u9762\u786e\u8ba4\u56fa\u5b9a\u85aa\u8d44\u3001\u63d0\u6210\u53e3\u5f84\u3001\u53d1\u653e\u6761\u4ef6\u548c\u5386\u53f2\u8fbe\u6210\u7387\u3002" });
  if (cityLiving && cityLiving.ratio < 0.95) findings.push({ category: "\u57ce\u5e02\u8d2d\u4e70\u529b", item: "\u85aa\u8d44\u4f4e\u4e8e\u57ce\u5e02\u751f\u6d3b\u53c2\u8003", level: cityLiving.ratio < 0.75 ? "high" : "medium", evidence: `${cityLiving.city}\u5b9a\u8d44\u4e0b\u9650\u7ea6 ${cityLiving.salaryFloor} \u5143/\u6708\uff0c\u4e3a ${cityLiving.referenceYear} \u5e74\u57ce\u9547\u5c45\u6c11\u6708\u5ea6\u751f\u6d3b\u53c2\u8003\u7684 ${Math.round(cityLiving.ratio * 100)}%\u3002`, suggestion: "\u7ed3\u5408\u623f\u79df\u3001\u901a\u52e4\u3001\u662f\u5426\u63d0\u4f9b\u4f4f\u5bbf/\u623f\u8865\u3001\u8bd5\u7528\u671f\u5de5\u8d44\u548c\u5bb6\u5ead\u8d1f\u62c5\u518d\u5224\u65ad\u3002" });

  const strengths: string[] = [];
  if (weeklyHoursDirect) strengths.push("\u5468\u5de5\u65f6\uff1a" + weeklyHoursDirect);
  if (baseValue) strengths.push("\u5e95\u85aa\uff1a" + baseValue);
  if (commissionValue) strengths.push("\u63d0\u6210\uff1a" + commissionValue);
  if (socialValue) strengths.push("\u793e\u4fdd\u798f\u5229\uff1a" + socialValue);
  if (salaryNumber) strengths.push(`\u85aa\u8d44\uff1a${salaryNumber}`);
  if (dutyFound && !dutyVague) strengths.push("\u5c97\u4f4d\u804c\u8d23\u6709\u5177\u4f53\u63cf\u8ff0");
  if (locationValue) strengths.push(`\u5730\u70b9\uff1a${locationValue}`);
  if (benefitsValue) strengths.push(`\u798f\u5229\uff1a${benefitsValue}`);
  if (cityLiving && cityLiving.ratio >= 1.2) strengths.push(`\u57ce\u5e02\u8d2d\u4e70\u529b\uff1a${cityLiving.level}`);

  const riskScore = Math.max(0, Math.min(100, 100 - findings.reduce((total, item) => total + (item.level === "high" ? 20 : item.level === "medium" ? 12 : 6), 0)));
  const company = companyName ? `“${companyName}”` : "\u8fd9\u6761\u62db\u8058\u4fe1\u606f";
  const summary = riskScore >= 80 ? `${company}\u4fe1\u606f\u76f8\u5bf9\u5b8c\u6574\uff0c\u4f46\u4ecd\u5efa\u8bae\u5728\u6c9f\u901a\u65f6\u6838\u5b9e\u5173\u952e\u6761\u4ef6\u3002` : riskScore >= 55 ? `${company}\u5b58\u5728\u82e5\u5e72\u9700\u8981\u8865\u5145\u786e\u8ba4\u7684\u6761\u4ef6\uff0c\u5efa\u8bae\u4e0d\u8981\u53ea\u51ed\u622a\u56fe\u505a\u51b3\u5b9a\u3002` : `${company}\u5173\u952e\u5b57\u6bb5\u7f3a\u53e3\u8f83\u591a\uff0c\u5efa\u8bae\u5148\u8865\u9f50\u85aa\u8d44\u3001\u804c\u8d23\u548c\u7528\u5de5\u6761\u4ef6\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u63a8\u8fdb\u3002`;
  return { riskScore, summary, fields, findings, strengths, cityReference: cityLiving };
}

function normalizedForSourceCheck(value: string) {
  return value.replace(/[\s\u3000,，.。;；:：()（）\[\]【】"'“”‘’]/gu, "");
}

function buildAIReview(base: AnalysisResult, ai: AIAnalysisOutput, rawText: string): NonNullable<AnalysisResult["aiReview"]> {
  const source = normalizedForSourceCheck(rawText);
  const differences: NonNullable<AnalysisResult["aiReview"]>["differences"] = [];
  for (const key of Object.keys(base.fields)) {
    const candidate = ai.fields?.[key];
    const aiValue = typeof candidate?.value === "string" ? candidate.value.trim() : "";
    if (!aiValue || aiValue === "NOT_MENTIONED" || aiValue.length > 180 || !source.includes(normalizedForSourceCheck(aiValue))) continue;
    const ruleValue = base.fields[key]?.value || WORDS.missing;
    if (normalizedForSourceCheck(ruleValue) !== normalizedForSourceCheck(aiValue)) differences.push({ fieldKey: key, ruleValue, aiValue });
  }
  return {
    status: "complete",
    summary: typeof ai.summary === "string" ? ai.summary.trim().slice(0, 280) : "",
    differences: differences.slice(0, 12),
  };
}

function mergeAIResult(base: AnalysisResult, ai: AIAnalysisOutput, rawText: string): AnalysisResult {
  const aiReview = buildAIReview(base, ai, rawText);
  const fields = { ...base.fields };
  const source = normalizedForSourceCheck(rawText);
  for (const key of Object.keys(fields)) {
    const candidate = ai.fields?.[key];
    const value = typeof candidate?.value === "string" ? candidate.value.trim() : "";
    // The model is allowed to fill a missing field only with a source quote.
    // This prevents a bare OCR label from turning into a long made-up value.
    if (!value || value === "NOT_MENTIONED" || value.includes(WORDS.missing) || value.length > 180 || !source.includes(normalizedForSourceCheck(value))) continue;
    const state = candidate?.state === "unclear" || candidate?.state === "missing" ? candidate.state : "found";
    if (fields[key].state !== "missing") continue;
    if (state !== "missing") fields[key] = { value, state };
  }
  const findings = [...(ai.findings || []).map((item) => ({
    category: item.category?.trim() || "",
    item: item.item?.trim() || "",
    level: (item.level === "high" || item.level === "medium" || item.level === "low" ? item.level : "low") as FindingLevel,
    evidence: item.evidence?.trim() || "",
    suggestion: item.suggestion?.trim() || "",
  })).filter((item) => item.category && item.item && item.evidence && item.suggestion), ...base.findings];
  const uniqueFindings = Array.from(new Map(findings.map((item) => [item.category + ":" + item.item, item])).values()).slice(0, 40);
  const strengths = Array.from(new Set([
    ...(ai.strengths || []).filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 120),
    ...base.strengths,
  ])).slice(0, 20);
  return {
    ...base,
    summary: typeof ai.summary === "string" && ai.summary.trim() ? ai.summary.trim().slice(0, 500) : base.summary,
    fields,
    findings: uniqueFindings,
    strengths,
    aiEnhanced: true,
    aiReview,
  };
}

function serialize<T extends { resultJson: string; rawText: string; companyName: string | null }>(item: T) {
  let stored: AnalysisResult | null = null;
  try {
    stored = JSON.parse(item.resultJson) as AnalysisResult;
  } catch {
    stored = null;
  }
  // Old archives used a smaller field set. Re-analyze them on read so they can
  // participate in the current full-width editor without losing new edits.
  const result = stored?.fields?.salaryRange ? stored : analyzeText(item.rawText, item.companyName);
  return { ...item, riskScore: result.riskScore, result };
}

function applyLearnedCorrections(result: AnalysisResult, rawText: string, corrections: Array<{ fieldKey: string; sourceValue: string; correctedValue: string; state: string }>) {
  const normalizedSource = normalizedForSourceCheck(rawText);
  const fields = { ...result.fields };
  for (const correction of corrections) {
    if (!editableFieldKeys.has(correction.fieldKey) || !correction.sourceValue || !normalizedSource.includes(normalizedForSourceCheck(correction.sourceValue))) continue;
    fields[correction.fieldKey] = {
      value: correction.correctedValue,
      state: correction.state === "unclear" ? "unclear" : "found",
    };
  }
  return { ...result, fields };
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
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "\u672a\u547d\u540d\u62db\u8058\u5206\u6790";
    const analysisMode = body.analysisMode === "ai" ? "ai" : "rules";
    const aiPromise = analysisMode === "ai"
      ? callJobAnalysisAI(rawText, 180000).then((output) => ({ output, error: "" })).catch((error: unknown) => ({ output: null, error: error instanceof Error ? error.message : "AI 复核失败" }))
      : Promise.resolve(null);
    const deterministicResult = analyzeText(rawText, companyName);
    const [learnedCorrections, aiOutcome, similarityCandidates] = await Promise.all([
      prisma.jobAnalysisCorrection.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: { fieldKey: true, sourceValue: true, correctedValue: true, state: true },
      }),
      aiPromise,
      prisma.record.findMany({
        where: { status: "APPROVED", isReported: false },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true, type: true, title: true, content: true, position: true,
          salaryRange: true, workContent: true, actualSalary: true, actualWorkContent: true,
          city: true, createdAt: true,
          company: { select: { id: true, name: true } },
        },
      }),
    ]);
    let result = applyLearnedCorrections(deterministicResult, rawText, learnedCorrections);
    let aiUsed = false;
    if (analysisMode === "ai" && aiOutcome?.output) {
      result = mergeAIResult(result, aiOutcome.output, rawText);
      aiUsed = true;
    } else if (analysisMode === "ai") {
      if (aiOutcome?.error) console.error("AI analysis failed, using deterministic analysis:", aiOutcome.error);
      result = { ...result, aiReview: { status: "unavailable", summary: aiOutcome?.error || "AI 未配置或未返回结果", differences: [] } };
    }
    const similarRecords = findSimilarRecords({
      rawText,
      title,
      salary: result.fields.salaryRange?.value,
      duties: result.fields.duties?.value,
      requirements: result.fields.requirements?.value,
    }, similarityCandidates);
    const item = await prisma.jobAnalysis.create({ data: { userId, title, companyName, source: typeof body.source === "string" ? body.source.trim() || null : null, imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim() || null : null, rawText, resultJson: JSON.stringify(result), riskScore: result.riskScore } });
    return NextResponse.json({ success: true, analysisMode, aiUsed, item: serialize(item), result, similarRecords });
  } catch (error) {
    console.error("Create analysis archive error:", error);
    return NextResponse.json({ error: "\u5206\u6790\u4fdd\u5b58\u5931\u8d25" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "请先登录后保存修改" }, { status: 401 });
  try {
    const body = await request.json();
    const id = Number(body.id);
    const fieldKey = typeof body.fieldKey === "string" ? body.fieldKey : "";
    const value = typeof body.value === "string" ? body.value.trim().slice(0, 500) : "";
    const state: FieldState = body.state === "unclear" || !value ? (body.state === "unclear" && value ? "unclear" : "missing") : "found";
    if (!Number.isInteger(id) || id < 1 || !editableFieldKeys.has(fieldKey)) return NextResponse.json({ error: "修改的字段无效" }, { status: 400 });
    const item = await prisma.jobAnalysis.findFirst({ where: { id, userId } });
    if (!item) return NextResponse.json({ error: "找不到该分析存档" }, { status: 404 });
    const current = serialize(item).result;
    const sourceValue = current.fields[fieldKey]?.value || "";
    const result: AnalysisResult = {
      ...current,
      fields: { ...current.fields, [fieldKey]: { value: value || WORDS.missing, state } },
    };
    const updated = await prisma.jobAnalysis.update({
      where: { id },
      data: { resultJson: JSON.stringify(result) },
    });
    if (value && sourceValue && sourceValue !== value && !sourceValue.includes(WORDS.missing)) {
      await prisma.jobAnalysisCorrection.create({
        data: { userId, fieldKey, sourceValue, correctedValue: value, state },
      });
    }
    return NextResponse.json({ success: true, item: serialize(updated) });
  } catch (error) {
    console.error("Update analysis archive error:", error);
    return NextResponse.json({ error: "保存修改失败" }, { status: 500 });
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
