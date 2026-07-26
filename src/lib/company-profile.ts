export type ExternalImpactLevel = "critical" | "high" | "medium" | "low";

export interface CompanyExternalMetric {
  key: string;
  label: string;
  value: string;
  impact: ExternalImpactLevel;
  note: string;
}

export interface CompanyExternalProfile {
  provider: string | null;
  updatedAt: string | null;
  items: CompanyExternalMetric[];
  rawSummary: string | null;
}

const impactOrder: Record<ExternalImpactLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const metricConfig = [
  { key: "laborDisputes", label: "劳动争议", impact: "critical", note: "直接影响用工规范和入职稳定性。" },
  { key: "legalDisputes", label: "法律纠纷", impact: "critical", note: "高频诉讼通常意味着经营和治理风险。" },
  { key: "executedCases", label: "被执行案件", impact: "high", note: "会影响工资兑现和合同履约预期。" },
  { key: "executedAmount", label: "被执行金额", impact: "high", note: "金额越高，现金流压力通常越明显。" },
  { key: "socialInsuranceCount", label: "社保参保人数", impact: "high", note: "可以反映团队规模、收缩迹象和稳定度。" },
  { key: "abnormalOperations", label: "经营异常", impact: "high", note: "涉及合规和经营连续性风险。" },
  { key: "adminPenalties", label: "行政处罚", impact: "high", note: "多次处罚通常会影响岗位安全感。" },
  { key: "taxCredit", label: "纳税信用", impact: "medium", note: "可辅助判断公司经营规范程度。" },
  { key: "establishmentYears", label: "成立年限", impact: "medium", note: "过短或频繁变更时需要结合岗位谨慎判断。" },
  { key: "financingStage", label: "融资阶段", impact: "low", note: "有助于理解发展阶段，但不单独构成风险。" },
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(key: string, value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    if (key === "executedAmount") return "￥" + value.toLocaleString("zh-CN");
    if (key === "establishmentYears") return value + " 年";
    return value.toLocaleString("zh-CN");
  }

  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "是" : "否";
  return null;
}

export function parseCompanyExternalProfile(businessInfo: string | null): CompanyExternalProfile {
  if (!businessInfo) {
    return { provider: null, updatedAt: null, items: [], rawSummary: null };
  }

  try {
    const parsed = JSON.parse(businessInfo) as unknown;
    if (!isObject(parsed)) {
      return { provider: null, updatedAt: null, items: [], rawSummary: businessInfo };
    }

    const source = isObject(parsed.external) ? parsed.external : parsed;
    const metrics = isObject(source.metrics) ? source.metrics : source;

    const items: CompanyExternalMetric[] = [];

    for (const metric of metricConfig) {
      const value = formatValue(metric.key, metrics[metric.key]);
      if (!value) continue;
      items.push({
        key: metric.key,
        label: metric.label,
        value,
        impact: metric.impact,
        note: metric.note,
      });
    }

    items.sort((left, right) => impactOrder[left.impact] - impactOrder[right.impact]);

    const provider = typeof source.provider === "string" ? source.provider : null;
    const updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : null;
    const rawSummary = typeof source.summary === "string" ? source.summary : null;

    return { provider, updatedAt, items, rawSummary };
  } catch {
    return { provider: null, updatedAt: null, items: [], rawSummary: businessInfo };
  }
}
