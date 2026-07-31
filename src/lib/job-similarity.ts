export interface SimilaritySource {
  rawText: string;
  title?: string;
  salary?: string;
  duties?: string;
  requirements?: string;
}

export interface SimilarityCandidate {
  id: number;
  type: string;
  title: string;
  content: string;
  position: string;
  salaryRange: string | null;
  workContent: string | null;
  actualSalary: string | null;
  actualWorkContent: string | null;
  city: string;
  createdAt: Date;
  company: { id: number; name: string };
}

export interface SimilarRecordMatch {
  recordId: number;
  companyId: number;
  companyName: string;
  title: string;
  position: string;
  city: string;
  recordType: string;
  publishedAt: string;
  score: number;
  reasons: string[];
  excerpt: string;
}

const STOP_WORDS = new Set([
  "工作", "岗位", "职位", "招聘", "负责", "要求", "公司", "相关", "进行", "以及", "具有", "具备", "能够", "优先", "以上", "以下", "不限", "内容", "薪资", "待遇", "我们", "提供", "完成", "需要", "任职", "职责",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s\u3000，。；：、！？,.!?;:()（）【】\[\]<>《》"'“”‘’|/\\_-]+/gu, "");
}

function terms(value: string) {
  const compact = normalize(value);
  const result = new Set<string>();
  const latin = value.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,20}|\d+(?:\.\d+)?(?:k|w|万|千|元|小时|天|月|年)?/gu) || [];
  latin.forEach((item) => result.add(item));
  const chinese = compact.replace(/[a-z0-9]/gu, "");
  for (let index = 0; index < chinese.length - 1; index += 1) {
    const token = chinese.slice(index, index + 2);
    if (!STOP_WORDS.has(token)) result.add(token);
  }
  return result;
}

function overlap(left: string, right: string) {
  if (!left || !right) return 0;
  const a = terms(left);
  const b = terms(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((item) => { if (b.has(item)) common += 1; });
  return common / Math.max(4, Math.min(a.size, b.size));
}

function salarySignals(value: string) {
  const normalized = value.toLowerCase();
  const signals = new Set(normalized.match(/\d+(?:\.\d+)?\s*(?:k|w|万|千|元|\/月|\/天|\/小时)?|无责底薪|基本工资|底薪|绩效|提成|奖金|餐补|房补|交通补贴|夜班补贴|岗位补贴|时薪|日薪|月薪|年薪/gu) || []);
  return [...signals].join(" ");
}

function phraseSimilarity(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (a.length < 8 || b.length < 8) return 0;
  if (a.includes(b.slice(0, Math.min(24, b.length))) || b.includes(a.slice(0, Math.min(24, a.length)))) return 1;
  return overlap(left, right);
}

function excerpt(value: string) {
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length > 110 ? text.slice(0, 110) + "..." : text;
}

export function findSimilarRecords(source: SimilaritySource, candidates: SimilarityCandidate[], limit = 6): SimilarRecordMatch[] {
  return candidates.map((candidate) => {
    const candidateText = [candidate.title, candidate.position, candidate.content, candidate.workContent || "", candidate.actualWorkContent || ""].join(" ");
    const candidateSalary = [candidate.salaryRange || "", candidate.actualSalary || "", candidate.content].join(" ");
    const dimensions = [
      { label: "岗位相似", value: overlap(source.title || source.rawText.slice(0, 80), `${candidate.position} ${candidate.title}`), weight: 18 },
      { label: "相似话术", value: phraseSimilarity(source.rawText, candidate.content), weight: 22 },
      { label: "薪资结构相似", value: overlap(salarySignals(`${source.salary || ""} ${source.rawText}`), salarySignals(candidateSalary)), weight: 20 },
      { label: "工作内容相似", value: overlap(source.duties || source.rawText, candidate.workContent || candidateText), weight: 25 },
      { label: "任职要求相似", value: overlap(source.requirements || source.rawText, candidate.content), weight: 15 },
    ];
    const score = Math.min(99, Math.round(dimensions.reduce((total, item) => total + Math.min(1, item.value) * item.weight, 0)));
    const reasons = dimensions.filter((item) => item.value >= 0.22).sort((a, b) => b.value - a.value).map((item) => item.label);
    return {
      recordId: candidate.id,
      companyId: candidate.company.id,
      companyName: candidate.company.name,
      title: candidate.title,
      position: candidate.position,
      city: candidate.city,
      recordType: candidate.type,
      publishedAt: candidate.createdAt.toISOString(),
      score,
      reasons,
      excerpt: excerpt(candidate.workContent || candidate.content),
    };
  }).filter((item) => item.score >= 28 && item.reasons.length > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
