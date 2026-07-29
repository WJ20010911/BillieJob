"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import LoginDialog from "@/components/LoginDialog";

interface UserInfo {
  id: number;
  identifier: string;
  membershipDays: number;
}

interface Finding {
  category: string;
  item: string;
  level: "high" | "medium" | "low";
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
  fields: Record<string, { value: string; state: "found" | "missing" | "unclear" }>;
  findings: Finding[];
  strengths: string[];
  cityReference?: CityReference;
}

interface ArchiveItem {
  id: number;
  title: string;
  companyName: string | null;
  source: string | null;
  imageUrl: string | null;
  rawText: string;
  riskScore: number;
  createdAt: string;
  result: AnalysisResult;
}

const USER_KEY = "job_insight_user";
const fieldLabels: Record<string, string> = {
  salaryRange: "薪资范围",
  salaryStructure: "\u85aa\u8d44\u6784\u6210",
  salaryBase: "\u57fa\u672c\u5de5\u8d44/\u65e0\u8d23\u5e95\u85aa",
  commission: "\u63d0\u6210",
  performance: "\u7ee9\u6548",
  probationCompensation: "\u8bd5\u7528\u671f\u5f85\u9047",
  regularCompensation: "\u8f6c\u6b63\u540e\u5f85\u9047",
  afterTaxIncome: "\u4e2a\u7a0e\u540e\u56fa\u5b9a\u6536\u5165",
  estimatedGross: "\u6309\u6392\u73ed\u9884\u4f30\u7a0e\u524d\u6536\u5165",
  estimatedTakeHome: "\u793e\u4fdd/\u516c\u79ef\u91d1\u540e\u9884\u4f30\u5230\u624b",
  taskRequirement: "\u4efb\u52a1/KPI \u8981\u6c42",
  duties: "工作内容",
  location: "工作地点",
  requirements: "任职要求",
  workTime: "\u6bcf\u65e5\u5de5\u4f5c\u65f6\u95f4",
  dailyHours: "\u6bcf\u65e5\u5de5\u4f5c\u5c0f\u65f6",
  weeklyHours: "\u6bcf\u5468\u5de5\u65f6",
  weeklyWorkDays: "\u6bcf\u5468\u5de5\u4f5c\u5929\u6570",
  shiftWork: "\u662f\u5426\u5012\u73ed",
  overtimePolicy: "\u52a0\u73ed\u653f\u7b56",
  benefits: "福利待遇",
  monthlyAllowance: "\u6bcf\u6708\u8865\u8d34",
  dailyAllowance: "\u6bcf\u5929\u8865\u8d34",
  mealAllowance: "\u98df\u8865",
  transportAllowance: "\u8f66\u8d39/\u4ea4\u901a\u8865\u8d34",
  housingAllowance: "\u623f\u8865",
  bonus: "\u5956\u91d1",
  socialBenefits: "\u793e\u4fdd/\u516c\u79ef\u91d1",
  employment: "用工类型",
  process: "招聘流程",
};

function levelLabel(level: Finding["level"]) {
  return level === "high" ? { text: "高风险", style: "bg-red-50 text-red-700" } : level === "medium" ? { text: "需确认", style: "bg-amber-50 text-amber-700" } : { text: "信息缺口", style: "bg-slate-100 text-slate-600" };
}

function scoreStyle(score: number) {
  if (score >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 55) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value));
}

function editableValue(field: { value: string; state: "found" | "missing" | "unclear" } | undefined) {
  if (!field || field.state === "missing") return "";
  return field.value;
}

function extractJobMeta(ocrText: string) {
  const lines = ocrText.split(/\r?\n/u).map((line) => line.replace(/\s+/gu, " ").trim()).filter(Boolean);
  const detailIndex = lines.findIndex((line) => /职位详情|岗位详情|职位描述/u.test(line));
  const beforeDetail = detailIndex >= 0 ? lines.slice(0, detailIndex) : lines.slice(0, 12);
  const companyLine = beforeDetail.find((line) => /(?:[•·]|\s)(?:hr|HR|招聘者|人事)$/u.test(line));
  const companyName = companyLine?.replace(/(?:[•·]|\s)+(?:hr|HR|招聘者|人事)$/u, "").trim() || "";
  const titleLine = beforeDetail.find((line) => /客服|工程师|设计师|运营|销售|专员|助理|经理|顾问|老师|开发|产品|会计|行政|主播|编辑/u.test(line) && !/职位详情|工作内容|任职要求/u.test(line));
  const title = titleLine?.replace(/\s*[（(].*$/u, "").replace(/\s*[-—]\s*$/u, "").trim() || "";
  return { title, companyName };
}

function cleanOcrText(ocrText: string) {
  const interfaceOnly = /^(?:[<>‹›《》←→]|不感兴趣|继续沟通|立即沟通|发消息|投递简历|收藏|分享|举报|查看全部|BOSS直聘|Boss直聘)$/iu;
  return ocrText.split(/\r?\n/u).map((line) => line.replace(/\s+/gu, " ").trim()).filter((line) => {
    if (!line || interfaceOnly.test(line)) return false;
    // A line such as "20:57 @M" is a phone status bar, not a working-time field.
    if (/^\d{1,2}:\d{2}(?:\s|$).*(?:@|[▮▯]|%|4G|5G|Wi-?Fi|电量)/iu.test(line)) return false;
    return true;
  }).join("\n");
}

export default function AnalyzePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [source, setSource] = useState("");
  const [rawText, setRawText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeArchiveId, setActiveArchiveId] = useState<number | null>(null);
  const [screen, setScreen] = useState<"input" | "result">("input");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showLogin, setShowLogin] = useState(false);
  const [loginInput, setLoginInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [logging, setLogging] = useState(false);

  const loadArchives = async (userId: number) => {
    const response = await fetch("/api/analyze", { headers: { "x-user-id": String(userId) } });
    if (!response.ok) return;
    const data = await response.json();
    setArchives(data.items || []);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        const stored = raw ? JSON.parse(raw) as UserInfo : null;
        setUser(stored);
        if (stored) void loadArchives(stored.id);
      } catch {
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const selectedArchives = useMemo(() => archives.filter((item) => selectedIds.includes(item.id)), [archives, selectedIds]);

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setMessage("请上传 10MB 以内的 PNG、JPEG、WebP 或 GIF 图片");
      return;
    }
    setMessage("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "截图上传失败");
      setImageUrl(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "截图上传失败");
    } finally {
      setUploading(false);
    }
  };

  const runOcr = async () => {
    if (!imageFile || ocrLoading) return;
    setOcrLoading(true);
    setMessage("正在尝试识别截图文字，首次识别可能需要下载语言包...");
    try {
      const formData = new FormData();
      formData.append("file", imageFile);
      const response = await fetch("/api/analyze/ocr", { method: "POST", body: formData });
      const body = await response.text();
      let data: { text?: string; error?: string } = {};
      try {
        data = JSON.parse(body) as { text?: string; error?: string };
      } catch {
        throw new Error(response.ok ? "OCR 服务返回了无法识别的内容" : `OCR 请求失败（HTTP ${response.status}）`);
      }
      if (!response.ok) throw new Error(data.error || "OCR request failed");
      const recognizedText = String(data.text || "").trim();
      if (!recognizedText) throw new Error("没有识别到文字");
      const text = cleanOcrText(recognizedText);
      if (!text) throw new Error("识别结果只包含界面元素，请换一张更完整的截图");
      setRawText(text);
      const meta = extractJobMeta(recognizedText);
      if (meta.title) setTitle((previous) => previous.trim() || meta.title);
      if (meta.companyName) setCompanyName((previous) => previous.trim() || meta.companyName);
      setMessage(meta.title || meta.companyName ? "截图文字已识别，已自动填写职位和公司，请校对后开始分析。" : "截图文字已识别，请校对后开始分析。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "OCR 请求失败";
      const friendly = detail === "Failed to fetch" ? "无法连接到网站服务器，OCR 请求未能发出" : detail;
      setMessage(`${friendly}。你仍可直接在下方“招聘原文”粘贴文字后开始分析。`);
    } finally {
      setOcrLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    if (rawText.trim().length < 12) {
      setMessage("请把截图中的招聘文字粘贴或校对到下方，至少 12 个字");
      return;
    }
    setAnalyzing(true);
    setMessage("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
        body: JSON.stringify({ title, companyName, source, rawText, imageUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "分析失败");
      setResult(data.result);
      setActiveArchiveId(data.item.id);
      setScreen("result");
      setArchives((previous) => [data.item, ...previous]);
      setMessage("分析已完成并存档，可以在下方选择多个职位进行对比");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : previous.length >= 4 ? previous : [...previous, id]);
  };

  const deleteArchive = async (id: number) => {
    if (!user) return;
    const response = await fetch(`/api/analyze?id=${id}`, { method: "DELETE", headers: { "x-user-id": String(user.id) } });
    if (response.ok) {
      setArchives((previous) => previous.filter((item) => item.id !== id));
      setSelectedIds((previous) => previous.filter((item) => item !== id));
      if (activeArchiveId === id) {
        setActiveArchiveId(null);
        setResult(null);
      }
    }
  };

  const updateField = (fieldKey: string, value: string) => {
    setResult((previous) => previous ? { ...previous, fields: { ...previous.fields, [fieldKey]: { value, state: value.trim() ? "found" : "missing" } } } : previous);
    setSavedField(null);
  };

  const saveField = async (fieldKey: string) => {
    if (!user || !result || !activeArchiveId || savingField === fieldKey) return;
    const field = result.fields[fieldKey];
    setSavingField(fieldKey);
    try {
      const response = await fetch("/api/analyze", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
        body: JSON.stringify({ id: activeArchiveId, fieldKey, value: field.value, state: field.state }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存修改失败");
      setResult(data.item.result);
      setArchives((previous) => previous.map((item) => item.id === data.item.id ? data.item : item));
      setSavedField(fieldKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存修改失败");
    } finally {
      setSavingField(null);
    }
  };

  const openArchive = (item: ArchiveItem) => {
    setResult(item.result);
    setActiveArchiveId(item.id);
    setSavedField(null);
    setScreen("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearDraft = () => {
    setTitle("");
    setCompanyName("");
    setSource("");
    setRawText("");
    setImageUrl("");
    setImagePreview("");
    setImageFile(null);
    setMessage("");
  };

  const handleLogin = async () => {
    const identifier = loginInput.trim();
    if (!identifier) return;
    setLogging(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登录失败");
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      setShowLogin(false);
      setLoginInput("");
      void loadArchives(data.user.id);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLogging(false);
    }
  };

  if (!authReady) return <div className="mx-auto max-w-6xl px-4 py-20 text-center text-sm text-slate-400">正在准备分析工具...</div>;

  return (
    <div className={screen === "result" ? "min-h-screen bg-slate-100" : "mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12"}>
      {screen === "input" ? <>
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">Job signal check</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">招聘截图分析</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">识别薪资、职责、工作制度和用工条件的信息缺口，留下可回看的判断依据。</p>
        </div>
        <a href="/analyze" className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-950 bg-slate-950 px-5 text-sm font-bold text-white shadow-[0_8px_0_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-cyan-700 hover:border-cyan-700">查看分析存档</a>
      </header>

      {!user ? <div className="mt-6 border-2 border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">分析可以浏览，保存和对比需要先登录。<button type="button" onClick={() => setShowLogin(true)} className="ml-2 font-bold underline underline-offset-4">登录</button></div> : null}

      <main className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="border-2 border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div><h2 className="text-lg font-bold text-slate-950">1. 上传并补充招聘信息</h2><p className="mt-1 text-xs text-slate-500">截图作为原始证据保存；文字请从截图中复制或校对后粘贴。</p></div>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">可存档</span>
          </div>

          <label className="mt-6 flex min-h-40 cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-cyan-500 hover:bg-cyan-50/30">
            {imagePreview ? <div className="relative h-56 w-full"><Image src={imagePreview} alt="招聘截图预览" fill unoptimized className="object-contain" /></div> : <div className="px-6 text-center"><div className="text-3xl">▧</div><div className="mt-2 text-sm font-bold text-slate-700">点击上传招聘平台截图</div><div className="mt-1 text-xs text-slate-400">支持 PNG / JPEG / WebP / GIF，最大 10MB</div></div>}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImage} className="hidden" />
          </label>
          {uploading ? <p className="mt-2 text-xs text-cyan-700">正在保存截图...</p> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-800">分析标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：某公司产品经理 JD" className="mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
            <label className="block text-sm font-semibold text-slate-800">公司名称（可选）<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="例如：某某科技" className="mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-800">来源平台（可选）<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="例如：BOSS 直聘、猎聘、微信群" className="mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-800">招聘文字 <span className="font-normal text-slate-400">（必填，截图识别/复制后粘贴）</span><textarea value={rawText} onChange={(event) => setRawText(event.target.value)} rows={8} placeholder="把截图中的职位名称、职责、薪资、工作地点、要求等文字粘贴到这里，系统会按字段分析..." className="mt-2 w-full resize-y border border-slate-300 bg-white px-3 py-3 text-sm font-normal leading-6 outline-none focus:border-cyan-600" /></label>
          {message ? <p className="mt-4 border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">{message}</p> : null}
        </section>

        <aside className="h-fit border-2 border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)] lg:sticky lg:top-24">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Actions</p>
          <h2 className="mt-2 text-lg font-bold text-slate-950">操作面板</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">上传截图后先识别文字；确认左侧内容后开始分析。</p>
          <div className="mt-5 space-y-3">
            <button type="button" onClick={() => void runAnalysis()} disabled={analyzing || uploading} className="inline-flex h-12 w-full items-center justify-center border-2 border-slate-950 bg-cyan-600 px-4 text-sm font-bold text-white shadow-[0_5px_0_#0f172a] transition hover:bg-cyan-700 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60">{analyzing ? "正在分析..." : "开始分析"}</button>
            <button type="button" onClick={() => void runOcr()} disabled={!imageFile || ocrLoading} className="inline-flex h-11 w-full items-center justify-center border-2 border-cyan-700 bg-cyan-50 px-4 text-sm font-bold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">{ocrLoading ? "识别中..." : "识别截图文字"}</button>
            <button type="button" onClick={clearDraft} disabled={analyzing || uploading} className="inline-flex h-10 w-full items-center justify-center border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-red-300 hover:text-red-700 disabled:opacity-50">清空本次输入</button>
          </div>
          {activeArchiveId ? <div className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">本次会更新已打开的存档；新的分析会另存为新记录。</div> : null}
        </aside>

      </main>

      </> : null}

      {result && screen === "result" ? <section className="w-full border-y-2 border-slate-900 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.08)]">
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-8"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{activeArchiveId ? "已打开分析存档" : "新分析结果"}</p><p className="text-xs text-slate-500">字段修改会自动保存</p></div><button type="button" onClick={() => { setScreen("input"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="inline-flex h-10 shrink-0 items-center justify-center border-2 border-slate-900 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-100">返回编辑</button></div>
        <div className="flex flex-col gap-5 border-b-2 border-slate-900 bg-slate-950 px-5 py-6 text-white sm:px-7 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Analysis result</p><h2 className="mt-2 text-2xl font-bold">招聘信息分析结果</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{result.summary}</p></div>
          <div className="flex items-center gap-3"><div className={`border bg-white px-4 py-2 text-center ${scoreStyle(result.riskScore)} `}><div className="text-3xl font-bold">{result.riskScore}</div><div className="text-[11px] font-bold">信息完整度</div></div><div className="text-xs leading-5 text-slate-300">{activeArchiveId ? "编辑后自动保存到当前存档" : "分析完成后会自动存档"}</div></div>
        </div>
        <div className="p-5 sm:p-7">
          {result.strengths.length > 0 ? <div className="border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-800">已确认的信息</p><div className="mt-2 flex flex-wrap gap-2">{result.strengths.map((item) => <span key={item} className="border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">{item}</span>)}</div></div> : null}
          {result.cityReference ? <div className="mt-4 flex flex-col gap-3 border border-cyan-200 bg-cyan-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-900">{result.cityReference.city} 城市购买力：{result.cityReference.level}</p><p className="mt-1 text-xs text-slate-600">固定月薪下限 {result.cityReference.salaryFloor} 元，约为 {result.cityReference.referenceYear} 年城市月度生活参考 {result.cityReference.monthlyIncome} 元的 {Math.round(result.cityReference.ratio * 100)}%。</p></div><span className="shrink-0 border border-cyan-200 bg-white px-3 py-1 text-sm font-bold text-cyan-800">{result.cityReference.score}/20</span></div> : null}
          <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h3 className="text-xl font-bold text-slate-950">识别明细</h3><p className="mt-1 text-sm text-slate-500">直接改写任意内容，离开输入框后自动保存。空白字段可手动补充，不再用“未在文字中提及”占据页面。</p></div><span className="text-xs font-semibold text-slate-500">{savingField ? "正在保存修改..." : savedField ? "已保存，并记录为校正样本" : "绿色：原文确认；黄色：推算或待核实"}</span></div>
          <div className="mt-5 grid gap-x-5 gap-y-3 md:grid-cols-2 xl:grid-cols-3">{Object.keys(fieldLabels).map((key) => { const field = result.fields[key] || { value: "", state: "missing" as const }; const tone = field.state === "found" ? "border-emerald-200 bg-emerald-50/50" : field.state === "unclear" ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50"; return <label key={key} className={`block border p-3 ${tone}`}><span className="flex items-center justify-between gap-2 text-xs font-bold text-slate-700">{fieldLabels[key]}<span className="shrink-0 text-[10px] font-medium text-slate-400">{savingField === key ? "保存中" : savedField === key ? "已保存" : field.state === "found" ? "已识别" : field.state === "unclear" ? "待核实" : "待补充"}</span></span><textarea value={editableValue(field)} onChange={(event) => updateField(key, event.target.value)} onBlur={() => void saveField(key)} rows={key === "duties" || key === "requirements" ? 3 : 2} placeholder="点击补充或修改" className="mt-2 block w-full resize-y border border-slate-300 bg-white px-2.5 py-2 text-sm leading-5 text-slate-800 outline-none focus:border-cyan-600" /></label>; })}</div>
        </div>
      </section> : null}

      {result && screen === "result" ? <section className="border-b-2 border-slate-200 bg-white px-5 py-8 sm:px-8"><div className="mx-auto max-w-[1440px]"><div className="flex items-end justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Findings</p><h2 className="mt-2 text-xl font-bold text-slate-950">问题与待确认事项</h2></div><span className="text-sm font-bold text-slate-500">{result.findings.length} 项</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b-2 border-slate-200 text-xs text-slate-500"><tr><th className="px-3 py-3">类别</th><th className="px-3 py-3">判断</th><th className="px-3 py-3">截图中的依据</th><th className="px-3 py-3">建议追问</th></tr></thead><tbody>{result.findings.map((finding) => { const level = levelLabel(finding.level); return <tr key={`${finding.category}-${finding.item}`} className="border-b border-slate-100 align-top"><td className="px-3 py-4 font-semibold text-slate-800">{finding.category}</td><td className="px-3 py-4"><div className="font-semibold text-slate-900">{finding.item}</div><span className={`mt-2 inline-flex px-2 py-1 text-xs font-bold ${level.style}`}>{level.text}</span></td><td className="px-3 py-4 leading-6 text-slate-600">{finding.evidence}</td><td className="px-3 py-4 leading-6 text-slate-600">{finding.suggestion}</td></tr>; })}</tbody></table></div></div></section> : null}

      {screen === "input" ? <section className="mt-8 border-2 border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-7"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Archive & compare</p><h2 className="mt-2 text-xl font-bold text-slate-950">分析存档与职位对比</h2><p className="mt-2 text-sm text-slate-500">点击“查看并编辑”可重新打开一份存档；勾选 2-4 条可横向比较。</p></div><span className="text-xs font-bold text-slate-400">已选 {selectedArchives.length} / 4</span></div>{archives.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">完成第一次分析后，存档会出现在这里。</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{archives.map((item) => <div key={item.id} className={`border p-4 transition ${activeArchiveId === item.id ? "border-slate-950 bg-slate-50" : selectedIds.includes(item.id) ? "border-cyan-600 bg-cyan-50/40" : "border-slate-200 bg-white"}`}><div className="flex items-start gap-3"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1 h-4 w-4 accent-cyan-600" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="truncate font-bold text-slate-950">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.companyName || "未填写公司"} {item.source ? `· ${item.source}` : ""}</p></div><span className={`shrink-0 px-2 py-1 text-xs font-bold ${scoreStyle(item.riskScore)}`}>{item.riskScore}</span></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{item.result.summary}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>{formatDate(item.createdAt)}</span><div className="flex items-center gap-3"><button type="button" onClick={() => openArchive(item)} className="font-semibold text-cyan-700 hover:text-cyan-900">查看并编辑</button><button type="button" onClick={() => void deleteArchive(item.id)} className="font-semibold text-red-500 hover:text-red-700">删除存档</button></div></div></div></div></div>)}</div>}
        {selectedArchives.length >= 2 ? <div className="mt-8 overflow-x-auto border-t-2 border-slate-100 pt-6"><h3 className="mb-3 text-base font-bold text-slate-950">横向比较表</h3><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b-2 border-slate-200"><tr><th className="px-3 py-3 text-slate-500">信息项</th>{selectedArchives.map((item) => <th key={item.id} className="px-3 py-3 font-bold text-slate-950">{item.title}</th>)}</tr></thead><tbody>{Object.keys(fieldLabels).map((key) => <tr key={key} className="border-b border-slate-100"><td className="px-3 py-3 font-semibold text-slate-700">{fieldLabels[key]}</td>{selectedArchives.map((item) => { const field = item.result.fields[key] || { value: "未在文字中提及", state: "missing" as const }; return <td key={item.id} className={`px-3 py-3 ${field.state === "missing" ? "font-semibold text-red-600" : field.state === "unclear" ? "font-semibold text-amber-700" : "text-emerald-700"}`}>{field.value}</td>; })}</tr>)}<tr className="border-b border-slate-100"><td className="px-3 py-3 font-semibold text-slate-700">问题数量</td>{selectedArchives.map((item) => <td key={item.id} className="px-3 py-3 font-bold text-slate-950">{item.result.findings.length} 项</td>)}</tr></tbody></table></div> : null}
      </section> : null}

      <LoginDialog open={showLogin} title="登录后保存职位分析" description="登录后可以保存截图、查看历史分析，并比较多个职位。" value={loginInput} error={loginError} loading={logging} onChange={setLoginInput} onClose={() => { setShowLogin(false); setLoginError(""); setLoginInput(""); }} onSubmit={handleLogin} />
    </div>
  );
}
