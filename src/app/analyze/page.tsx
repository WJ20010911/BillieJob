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

interface AnalysisResult {
  riskScore: number;
  summary: string;
  fields: Record<string, { value: string; state: "found" | "missing" | "unclear" }>;
  findings: Finding[];
  strengths: string[];
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
  salary: "薪资范围",
  duties: "工作内容",
  location: "工作地点",
  requirements: "任职要求",
  hours: "工作制度",
  benefits: "福利待遇",
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
  const [ocrProgress, setOcrProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
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
    setOcrProgress(0);
    setMessage("正在尝试识别截图文字，首次识别可能需要下载语言包...");
    try {
      const { recognize } = await import("tesseract.js");
      const recognized = await recognize(imageFile, "chi_sim+eng", {
        logger: (info) => setOcrProgress(Math.round((info.progress || 0) * 100)),
      });
      const text = recognized.data.text.trim();
      if (!text) throw new Error("没有识别到文字");
      setRawText(text);
      setMessage("截图文字已识别，请校对后开始分析。");
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message}，也可以手动粘贴截图文字。` : "OCR 失败，请手动粘贴截图文字。");
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
    }
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">Job signal check</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">招聘截图分析</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">识别薪资、职责、工作制度和用工条件的信息缺口，留下可回看的判断依据。</p>
        </div>
        <a href="/analyze" className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-950 bg-slate-950 px-5 text-sm font-bold text-white shadow-[0_8px_0_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-cyan-700 hover:border-cyan-700">查看分析存档</a>
      </header>

      {!user ? <div className="mt-6 border-2 border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">分析可以浏览，保存和对比需要先登录。<button type="button" onClick={() => setShowLogin(true)} className="ml-2 font-bold underline underline-offset-4">登录</button></div> : null}

      <main className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
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
          {imageFile ? <button type="button" onClick={() => void runOcr()} disabled={ocrLoading} className="mt-3 inline-flex h-10 items-center justify-center border-2 border-cyan-700 bg-cyan-50 px-4 text-sm font-bold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-wait disabled:opacity-60">{ocrLoading ? `识别中 ${ocrProgress}%` : "尝试识别截图文字"}</button> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-800">分析标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：某公司产品经理 JD" className="mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
            <label className="block text-sm font-semibold text-slate-800">公司名称（可选）<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="例如：某某科技" className="mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-800">来源平台（可选）<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="例如：BOSS 直聘、猎聘、微信群" className="mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-800">招聘文字 <span className="font-normal text-slate-400">（必填，截图识别/复制后粘贴）</span><textarea value={rawText} onChange={(event) => setRawText(event.target.value)} rows={8} placeholder="把截图中的职位名称、职责、薪资、工作地点、要求等文字粘贴到这里，系统会按字段分析..." className="mt-2 w-full resize-y border border-slate-300 bg-white px-3 py-3 text-sm font-normal leading-6 outline-none focus:border-cyan-600" /></label>
          {message ? <p className="mt-4 border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">{message}</p> : null}
          <button type="button" onClick={() => void runAnalysis()} disabled={analyzing || uploading} className="mt-5 inline-flex h-12 w-full items-center justify-center border-2 border-slate-950 bg-cyan-600 px-6 text-sm font-bold text-white shadow-[0_5px_0_#0f172a] transition hover:bg-cyan-700 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60">{analyzing ? "正在分析并存档..." : "开始分析招聘信息"}</button>
        </section>

        <aside className="space-y-5">
          {result ? <section className="border-2 border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)]"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Analysis result</p><h2 className="mt-2 text-lg font-bold text-slate-950">风险概览</h2></div><div className={`border px-3 py-2 text-center ${scoreStyle(result.riskScore)}`}><div className="text-2xl font-bold">{result.riskScore}</div><div className="text-[10px] font-bold">完整度</div></div></div><p className="mt-4 text-sm leading-6 text-slate-600">{result.summary}</p>{result.strengths.length > 0 ? <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs font-bold text-emerald-700">已识别的正向信息</p><div className="mt-2 flex flex-wrap gap-2">{result.strengths.map((item) => <span key={item} className="bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{item}</span>)}</div></div> : null}</section> : <section className="border-2 border-slate-200 bg-slate-50 p-5"><h2 className="text-lg font-bold text-slate-950">你会得到什么</h2><div className="mt-4 space-y-3 text-sm leading-6 text-slate-600"><p><b className="text-slate-950">字段检查：</b>薪资、地点、职责、福利、工时、用工类型。</p><p><b className="text-slate-950">风险提醒：</b>面议、纯提成、职责泛化、加班制度缺失等。</p><p><b className="text-slate-950">横向比较：</b>从存档中选择最多 4 个职位，放在同一张表里比较。</p></div></section>}
          {result ? <section className="border-2 border-slate-200 bg-white p-5"><h2 className="text-base font-bold text-slate-950">信息字段状态</h2><div className="mt-3 space-y-2">{Object.entries(result.fields).map(([key, field]) => <div key={key} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span className="text-slate-600">{fieldLabels[key] || key}</span><span className={field.state === "found" ? "font-semibold text-emerald-700" : field.state === "unclear" ? "font-semibold text-amber-700" : "font-semibold text-red-600"}>{field.value}</span></div>)}</div></section> : null}
        </aside>
      </main>

      {result ? <section className="mt-8 border-2 border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-7"><div className="flex items-end justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Findings</p><h2 className="mt-2 text-xl font-bold text-slate-950">问题与待确认事项</h2></div><span className="text-sm font-bold text-slate-500">{result.findings.length} 项</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b-2 border-slate-200 text-xs text-slate-500"><tr><th className="px-3 py-3">类别</th><th className="px-3 py-3">判断</th><th className="px-3 py-3">截图中的依据</th><th className="px-3 py-3">建议追问</th></tr></thead><tbody>{result.findings.map((finding) => { const level = levelLabel(finding.level); return <tr key={`${finding.category}-${finding.item}`} className="border-b border-slate-100 align-top"><td className="px-3 py-4 font-semibold text-slate-800">{finding.category}</td><td className="px-3 py-4"><div className="font-semibold text-slate-900">{finding.item}</div><span className={`mt-2 inline-flex px-2 py-1 text-xs font-bold ${level.style}`}>{level.text}</span></td><td className="px-3 py-4 leading-6 text-slate-600">{finding.evidence}</td><td className="px-3 py-4 leading-6 text-slate-600">{finding.suggestion}</td></tr>; })}</tbody></table></div></section> : null}

      <section className="mt-8 border-2 border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-7"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Archive & compare</p><h2 className="mt-2 text-xl font-bold text-slate-950">分析存档与职位对比</h2><p className="mt-2 text-sm text-slate-500">勾选 2-4 条分析，比较信息完整度和风险缺口。</p></div><span className="text-xs font-bold text-slate-400">已选 {selectedArchives.length} / 4</span></div>{archives.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">完成第一次分析后，存档会出现在这里。</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{archives.map((item) => <div key={item.id} className={`border p-4 transition ${selectedIds.includes(item.id) ? "border-cyan-600 bg-cyan-50/40" : "border-slate-200 bg-white"}`}><div className="flex items-start gap-3"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1 h-4 w-4 accent-cyan-600" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="truncate font-bold text-slate-950">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.companyName || "未填写公司"} {item.source ? `· ${item.source}` : ""}</p></div><span className={`shrink-0 px-2 py-1 text-xs font-bold ${scoreStyle(item.riskScore)}`}>{item.riskScore}</span></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{item.result.summary}</p><div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>{formatDate(item.createdAt)}</span><button type="button" onClick={() => void deleteArchive(item.id)} className="font-semibold text-red-500 hover:text-red-700">删除存档</button></div></div></div></div>)}</div>}
        {selectedArchives.length >= 2 ? <div className="mt-8 overflow-x-auto border-t-2 border-slate-100 pt-6"><h3 className="mb-3 text-base font-bold text-slate-950">横向比较表</h3><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b-2 border-slate-200"><tr><th className="px-3 py-3 text-slate-500">信息项</th>{selectedArchives.map((item) => <th key={item.id} className="px-3 py-3 font-bold text-slate-950">{item.title}</th>)}</tr></thead><tbody>{Object.keys(fieldLabels).map((key) => <tr key={key} className="border-b border-slate-100"><td className="px-3 py-3 font-semibold text-slate-700">{fieldLabels[key]}</td>{selectedArchives.map((item) => { const field = item.result.fields[key]; return <td key={item.id} className={`px-3 py-3 ${field.state === "missing" ? "font-semibold text-red-600" : field.state === "unclear" ? "font-semibold text-amber-700" : "text-emerald-700"}`}>{field.value}</td>; })}</tr>)}<tr className="border-b border-slate-100"><td className="px-3 py-3 font-semibold text-slate-700">问题数量</td>{selectedArchives.map((item) => <td key={item.id} className="px-3 py-3 font-bold text-slate-950">{item.result.findings.length} 项</td>)}</tr></tbody></table></div> : null}
      </section>

      <LoginDialog open={showLogin} title="登录后保存职位分析" description="登录后可以保存截图、查看历史分析，并比较多个职位。" value={loginInput} error={loginError} loading={logging} onChange={setLoginInput} onClose={() => { setShowLogin(false); setLoginError(""); setLoginInput(""); }} onSubmit={handleLogin} />
    </div>
  );
}
