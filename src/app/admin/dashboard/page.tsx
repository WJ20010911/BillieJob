"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RecordItem {
  id: number;
  type: string;
  title: string;
  content: string;
  rating: number | null;
  status: string;
  rejectReason?: string;
  company: { id: number; name: string };
  createdAt: string;
}

interface AIConfig {
  provider: string;
  endpoint: string;
  model: string;
  apiKeyHeader: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  encryptionConfigured: boolean;
}

interface ManagedUser { id: number; identifier: string; nickname: string | null; membershipDays: number; createdAt: string; _count: { records: number; redemptionUses: number } }
interface ManagedRecord { id: number; title: string; position: string; content: string; type: string; status: string; city: string; updatedAt: string }
interface ManagedCompany { id: number; name: string; _count: { records: number }; records: ManagedRecord[] }
interface RedemptionCode { id: number; code: string; membershipDays: number; maxUses: number; usedCount: number; active: boolean; createdAt: string; uses: Array<{ createdAt: string; user: { identifier: string; nickname: string | null } }> }
interface ManagedAd { id: number; title: string; description: string; imageUrl: string; targetUrl: string; enabled: boolean; startAt: string | null; endAt: string | null; impressionCount: number; completionCount: number; _count: { unlocks: number } }
interface BackupItem { archiveName: string; createdAt: string; archiveBytes: number; databaseBytes: number; uploadsIncluded: boolean; uploadFileCount: number }

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("PENDING");
  const [activeSection, setActiveSection] = useState<"audit" | "content" | "users" | "codes" | "ads" | "backup" | "config">("audit");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [ocrConfigured, setOcrConfigured] = useState<boolean | null>(null);
  const [ocrKey, setOcrKey] = useState("");
  const [ocrSaving, setOcrSaving] = useState(false);
  const [ocrMessage, setOcrMessage] = useState("");
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null);
  const [aiKey, setAIKey] = useState("");
  const [aiSaving, setAISaving] = useState(false);
  const [aiTesting, setAITesting] = useState(false);
  const [aiMessage, setAIMessage] = useState("");
  const [contentQuery, setContentQuery] = useState("");
  const [companies, setCompanies] = useState<ManagedCompany[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [operationMessage, setOperationMessage] = useState("");
  const [codeQuantity, setCodeQuantity] = useState(10);
  const [codeDays, setCodeDays] = useState(7);
  const [customDays, setCustomDays] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [ads, setAds] = useState<ManagedAd[]>([]);
  const [editingAdId, setEditingAdId] = useState<number | null>(null);
  const [adTitle, setAdTitle] = useState("");
  const [adDescription, setAdDescription] = useState("");
  const [adImageUrl, setAdImageUrl] = useState("");
  const [adTargetUrl, setAdTargetUrl] = useState("");
  const [adStartAt, setAdStartAt] = useState("");
  const [adEndAt, setAdEndAt] = useState("");
  const [editingRecord, setEditingRecord] = useState<ManagedRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupRetentionHours, setBackupRetentionHours] = useState(72);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");

  const loadBackups = async () => {
    setBackupLoading(true);
    try {
      const response = await fetch("/api/admin/backups", { cache: "no-store" });
      if (response.status === 401) { router.push("/admin"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "加载备份失败");
      setBackups(data.backups || []);
      setBackupRetentionHours(Number(data.retentionHours) || 72);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "加载备份失败");
    } finally {
      setBackupLoading(false);
    }
  };

  const createBackup = async () => {
    setBackupCreating(true);
    setBackupMessage("");
    try {
      const response = await fetch("/api/admin/backups", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创建备份失败");
      setBackupMessage("备份已创建，可直接下载并用于迁移服务器。");
      void loadBackups();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "创建备份失败");
    } finally {
      setBackupCreating(false);
    }
  };

  const loadOperations = async (kind: "companies" | "users" | "codes" | "ads", q = "") => {
    setOperationMessage("");
    const response = await fetch(`/api/admin/operations?kind=${kind}&q=${encodeURIComponent(q)}`);
    if (response.status === 401) { router.push("/admin"); return; }
    const data = await response.json();
    if (!response.ok) { setOperationMessage(data.error || "加载失败"); return; }
    if (kind === "companies") setCompanies(data.companies || []);
    if (kind === "users") setManagedUsers(data.users || []);
    if (kind === "codes") setCodes(data.codes || []);
    if (kind === "ads") setAds(data.ads || []);
  };

  const resetAdForm = () => { setEditingAdId(null); setAdTitle(""); setAdDescription(""); setAdImageUrl(""); setAdTargetUrl(""); setAdStartAt(""); setAdEndAt(""); };
  const saveAd = async () => {
    const action = editingAdId ? "updateAd" : "createAd";
    const response = await fetch("/api/admin/operations", { method: editingAdId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: editingAdId, title: adTitle, description: adDescription, imageUrl: adImageUrl, targetUrl: adTargetUrl, startAt: adStartAt || null, endAt: adEndAt || null, enabled: true }) });
    const data = await response.json();
    if (!response.ok) { setOperationMessage(data.error || "广告保存失败"); return; }
    setOperationMessage(editingAdId ? "广告已更新" : "广告已创建"); resetAdForm(); void loadOperations("ads");
  };
  const editAd = (item: ManagedAd) => { setEditingAdId(item.id); setAdTitle(item.title); setAdDescription(item.description); setAdImageUrl(item.imageUrl); setAdTargetUrl(item.targetUrl); setAdStartAt(item.startAt ? item.startAt.slice(0, 16) : ""); setAdEndAt(item.endAt ? item.endAt.slice(0, 16) : ""); };
  const adAction = async (action: "updateAd" | "deleteAd", item: ManagedAd) => {
    if (action === "deleteAd" && !window.confirm("确定删除这条广告吗？")) return;
    await fetch("/api/admin/operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: item.id, enabled: action === "updateAd" ? !item.enabled : undefined }) });
    void loadOperations("ads");
  };

  const editRecord = (record: ManagedRecord) => {
    setEditingRecord(record); setEditTitle(record.title); setEditPosition(record.position); setEditContent(record.content);
  };

  const saveRecord = async () => {
    if (!editingRecord) return;
    setEditSaving(true);
    try {
      const response = await fetch("/api/admin/operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateRecord", id: editingRecord.id, title: editTitle, position: editPosition, content: editContent }) });
      if (!response.ok) throw new Error();
      setEditingRecord(null); setOperationMessage("记录已更新"); void loadOperations("companies", contentQuery);
    } catch { setOperationMessage("更新失败"); } finally { setEditSaving(false); }
  };

  const deleteRecord = async () => {
    if (!editingRecord || !window.confirm("确定永久删除这条记录吗？此操作不能撤销。")) return;
    setEditSaving(true);
    try {
      const response = await fetch("/api/admin/operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteRecord", id: editingRecord.id }) });
      if (!response.ok) throw new Error();
      setEditingRecord(null); setOperationMessage("记录已删除"); void loadOperations("companies", contentQuery);
    } catch { setOperationMessage("删除失败"); } finally { setEditSaving(false); }
  };

  const giftMembership = async (userId: number, preset?: number) => {
    const raw = preset || Number(prompt("赠送会员天数（1-30）", "7"));
    if (!Number.isInteger(raw) || raw < 1 || raw > 30) return;
    const response = await fetch("/api/admin/operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "giftMembership", userId, days: raw }) });
    if (response.ok) { setOperationMessage("会员已赠送"); void loadOperations("users", contentQuery); } else setOperationMessage("赠送失败");
  };

  const createCodes = async () => {
    const days = customDays ? Number(customDays) : codeDays;
    const response = await fetch("/api/admin/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createCodes", quantity: codeQuantity, days, maxUses: 1 }) });
    const data = await response.json();
    if (response.ok) { setOperationMessage(`已生成 ${data.codes.length} 个单次兑换码`); void loadOperations("codes"); } else setOperationMessage(data.error || "生成失败");
  };

  useEffect(() => {
    let active = true;

    const loadRecords = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/records?status=" + filter);
        if (res.status === 401) {
          router.push("/admin");
          return;
        }
        if (!res.ok) throw new Error("加载失败");
        const data = await res.json();
        if (active) setRecords(data.records || []);
      } catch {
        if (active) setError("加载记录失败");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadRecords();

    return () => {
      active = false;
    };
  }, [filter, router]);

  useEffect(() => {
    fetch("/api/admin/ocr-config")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setOcrConfigured(Boolean(data.configured));
      })
      .catch(() => setOcrConfigured(false));
  }, []);

  const saveOCRConfiguration = async () => {
    setOcrSaving(true);
    setOcrMessage("");
    try {
      const response = await fetch("/api/admin/ocr-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: ocrKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "OCR 配置保存失败");
      setOcrConfigured(Boolean(data.configured));
      setOcrKey("");
      setOcrMessage("OCR 配置已保存，密钥已加密存储。环境变量仍可作为回退配置。 ");
    } catch (error) {
      setOcrMessage(error instanceof Error ? error.message : "OCR 配置保存失败");
    } finally {
      setOcrSaving(false);
    }
  };

  useEffect(() => {
    fetch("/api/admin/ai-config")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setAIConfig(data);
      })
      .catch(() => setAIMessage("AI 配置加载失败"));
  }, []);

  const updateAIConfig = (key: keyof Pick<AIConfig, "provider" | "endpoint" | "model" | "apiKeyHeader" | "enabled">, value: string | boolean) => {
    setAIConfig((previous) => previous ? { ...previous, [key]: value } : previous);
  };

  const useZhipuPreset = () => {
    setAIConfig((previous) => previous ? {
      ...previous,
      provider: "智谱 BigModel",
      endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      model: "glm-4-flash",
      apiKeyHeader: "Authorization",
      enabled: true,
    } : previous);
    setAIMessage("已填入智谱 GLM-4-Flash 配置，请填写 API Key 后保存。截图识别将优先尝试智谱文件解析。");
  };

  const saveAIConfiguration = async () => {
    if (!aiConfig) return;
    setAISaving(true);
    setAIMessage("");
    try {
      const response = await fetch("/api/admin/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...aiConfig, apiKey: aiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 配置保存失败");
      setAIConfig(data);
      setAIKey("");
      setAIMessage("AI 配置已保存，密钥已加密存储。");
    } catch (error) {
      setAIMessage(error instanceof Error ? error.message : "AI 配置保存失败");
    } finally {
      setAISaving(false);
    }
  };

  const testAIConfiguration = async () => {
    setAITesting(true);
    setAIMessage("");
    try {
      const response = await fetch("/api/admin/ai-config", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 接口测试失败");
      setAIMessage(data.message || "AI 接口连接成功");
    } catch (error) {
      setAIMessage(error instanceof Error ? error.message : "AI 接口测试失败");
    } finally {
      setAITesting(false);
    }
  };

  const handleAction = async (id: number, status: string, rejectReason?: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, rejectReason }),
      });

      if (res.ok) {
        setRecords((prev) => prev.filter((record) => record.id !== id));
      } else {
        alert("操作失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
          <p className="mt-1 text-sm text-slate-500">处理用户提交内容，并管理第三方服务配置。</p>
        </div>
      </div>

      <div className="mb-6 flex border-b-2 border-slate-200">
        <button type="button" onClick={() => setActiveSection("audit")} className={"border-b-4 px-5 py-3 text-sm font-bold transition " + (activeSection === "audit" ? "-mb-0.5 border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:text-slate-900")}>审核</button>
        <button type="button" onClick={() => { setActiveSection("content"); void loadOperations("companies", contentQuery); }} className={"border-b-4 px-5 py-3 text-sm font-bold transition " + (activeSection === "content" ? "-mb-0.5 border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:text-slate-900")}>内容管理</button>
        <button type="button" onClick={() => { setActiveSection("users"); void loadOperations("users", contentQuery); }} className={"border-b-4 px-5 py-3 text-sm font-bold transition " + (activeSection === "users" ? "-mb-0.5 border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:text-slate-900")}>用户</button>
        <button type="button" onClick={() => { setActiveSection("codes"); void loadOperations("codes"); }} className={"border-b-4 px-5 py-3 text-sm font-bold transition " + (activeSection === "codes" ? "-mb-0.5 border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:text-slate-900")}>兑换码</button>
        <button type="button" onClick={() => { setActiveSection("ads"); void loadOperations("ads"); }} className={"border-b-4 px-5 py-3 text-sm font-bold transition " + (activeSection === "ads" ? "-mb-0.5 border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:text-slate-900")}>广告</button>
        <button type="button" onClick={() => { setActiveSection("backup"); void loadBackups(); }} className={"border-b-4 px-5 py-3 text-sm font-bold transition " + (activeSection === "backup" ? "-mb-0.5 border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:text-slate-900")}>备份</button>
        <button type="button" onClick={() => setActiveSection("config")} className={"border-b-4 px-5 py-3 text-sm font-bold transition " + (activeSection === "config" ? "-mb-0.5 border-cyan-600 text-cyan-700" : "border-transparent text-slate-500 hover:text-slate-900")}>配置</button>
      </div>

      {operationMessage ? <p className="mb-4 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{operationMessage}</p> : null}

      {editingRecord ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="编辑记录"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-slate-300 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-slate-950">编辑记录</h2><p className="mt-1 text-xs text-slate-500">可直接修改标题、岗位名称与完整内容。</p></div><button type="button" onClick={() => setEditingRecord(null)} className="h-8 w-8 text-xl text-slate-500 hover:bg-slate-100" aria-label="关闭">×</button></div><div className="space-y-4 p-5"><label className="block text-sm font-semibold text-slate-800">标题<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={120} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal" /></label><label className="block text-sm font-semibold text-slate-800">岗位名称<input value={editPosition} onChange={(event) => setEditPosition(event.target.value)} maxLength={80} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal" /></label><label className="block text-sm font-semibold text-slate-800">记录内容<textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={5000} rows={14} className="mt-2 w-full resize-y border border-slate-300 px-3 py-2 text-sm font-normal leading-6" /></label></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => void deleteRecord()} disabled={editSaving} className="border border-red-300 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">删除记录</button><div className="flex gap-2"><button type="button" onClick={() => setEditingRecord(null)} disabled={editSaving} className="border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">取消</button><button type="button" onClick={() => void saveRecord()} disabled={editSaving || !editTitle.trim() || !editContent.trim()} className="border-2 border-slate-950 bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{editSaving ? "保存中..." : "保存修改"}</button></div></div></div></div> : null}

      {activeSection === "codes" ? (
        <section className="mb-4 border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-2"><label className="min-w-[220px] flex-1 text-sm font-semibold text-slate-800">查询兑换码<input value={codeQuery} onChange={(event) => setCodeQuery(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") void loadOperations("codes", codeQuery); }} placeholder="输入完整或部分兑换码" className="mt-2 h-10 w-full border border-slate-300 px-3 font-mono text-sm" /></label><button type="button" onClick={() => void loadOperations("codes", codeQuery)} className="h-10 border-2 border-slate-950 bg-cyan-600 px-4 text-sm font-bold text-white">查询</button></div>
          <p className="mt-2 text-xs text-slate-500">每个兑换码会显示会员天数、可用状态、领取账号和实际兑换时间。</p>
          {codes.length > 0 ? <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">{codes.map((code) => <div key={`detail-${code.id}`} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-sm text-slate-950">{code.code}</strong><span className="text-sm text-slate-600">{code.membershipDays} 天会员 · {code.usedCount}/{code.maxUses} 已用 · {code.active ? "可用" : "已作废"}</span></div>{code.uses.length === 0 ? <p className="mt-1 text-xs text-slate-400">尚未被使用</p> : <div className="mt-2 space-y-1">{code.uses.map((use, index) => <p key={`${code.id}-${index}`} className="text-xs text-slate-600">领取账号：<strong className="font-medium text-slate-800">{use.user.nickname || use.user.identifier}</strong>{use.user.nickname ? ` (${use.user.identifier})` : ""} · 兑换时间：{new Date(use.createdAt).toLocaleString("zh-CN")}</p>)}</div>}</div>)}</div> : <p className="mt-4 text-sm text-slate-400">未找到兑换码</p>}
        </section>
      ) : null}

      {activeSection === "content" ? <section className="space-y-4"><div className="flex gap-2"><input value={contentQuery} onChange={(event) => setContentQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadOperations("companies", contentQuery); }} placeholder="搜索公司名称" className="h-10 min-w-0 flex-1 border border-slate-300 px-3 text-sm" /><button onClick={() => void loadOperations("companies", contentQuery)} className="border-2 border-slate-950 bg-cyan-600 px-4 text-sm font-bold text-white">搜索</button></div>{companies.map((company) => <div key={company.id} className="border border-slate-200 bg-white p-4"><div className="flex justify-between"><strong>{company.name}</strong><span className="text-xs text-slate-400">{company._count.records} 条记录</span></div><div className="mt-3 space-y-2">{company.records.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="min-w-0"><p className="text-sm font-medium">{record.position || "未填写岗位"} · {record.title}</p><p className="line-clamp-1 text-xs text-slate-500">{record.content}</p></div><button onClick={() => void editRecord(record)} className="border border-slate-300 px-3 py-1.5 text-xs font-bold">编辑</button></div>)}</div></div>)}</section> : null}

      {activeSection === "users" ? <section className="space-y-3"><div className="flex gap-2"><input value={contentQuery} onChange={(event) => setContentQuery(event.target.value)} placeholder="搜索账号或昵称" className="h-10 min-w-0 flex-1 border border-slate-300 px-3 text-sm" /><button onClick={() => void loadOperations("users", contentQuery)} className="border-2 border-slate-950 bg-cyan-600 px-4 text-sm font-bold text-white">搜索</button></div>{managedUsers.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4"><div><strong className="text-sm">{item.nickname || item.identifier}</strong><p className="mt-1 text-xs text-slate-500">{item.identifier} · 会员 {item.membershipDays} 天 · 提交 {item._count.records} 条 · 已兑换 {item._count.redemptionUses} 次</p></div><div className="flex flex-wrap gap-1">{[1,3,7,14,30].map((day) => <button key={day} onClick={() => void giftMembership(item.id, day)} className="border border-cyan-300 px-2 py-1 text-xs text-cyan-800">+{day}天</button>)}<button onClick={() => void giftMembership(item.id)} className="border border-slate-400 px-2 py-1 text-xs">自定义</button></div></div>)}</section> : null}

      {activeSection === "codes" ? <section><div className="border-2 border-slate-900 bg-white p-5"><h2 className="font-bold">批量生成推广兑换码</h2><div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">数量<input type="number" min="1" max="200" value={codeQuantity} onChange={(event) => setCodeQuantity(Number(event.target.value))} className="ml-2 h-10 w-20 border border-slate-300 px-2" /></label><label className="text-sm">会员天数<select value={codeDays} onChange={(event) => { setCodeDays(Number(event.target.value)); setCustomDays(""); }} className="ml-2 h-10 border border-slate-300 px-2">{[1,3,7,14,30].map((day) => <option key={day} value={day}>{day}天</option>)}</select></label><label className="text-sm">自定义 1-30<input value={customDays} onChange={(event) => setCustomDays(event.target.value)} type="number" min="1" max="30" className="ml-2 h-10 w-20 border border-slate-300 px-2" /></label><button onClick={() => void createCodes()} className="h-10 border-2 border-slate-950 bg-cyan-600 px-4 text-sm font-bold text-white">生成单次码</button></div></div><div className="mt-4 overflow-x-auto border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">兑换码</th><th>天数</th><th>使用情况</th><th>状态</th><th></th></tr></thead><tbody>{codes.map((code) => <tr key={code.id} className="border-t"><td className="p-3 font-mono font-medium">{code.code}</td><td>{code.membershipDays} 天</td><td>{code.usedCount}/{code.maxUses}</td><td>{code.active ? "可用" : "已作废"}</td><td><button onClick={async () => { await fetch("/api/admin/operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setCodeActive", id: code.id, active: !code.active }) }); void loadOperations("codes"); }} className="px-3 py-2 text-xs font-bold text-red-700">{code.active ? "作废" : "恢复"}</button></td></tr>)}</tbody></table></div></section> : null}

      {activeSection === "ads" ? <section className="space-y-5"><div className="border-2 border-slate-900 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">记录页静态广告</h2><p className="mt-1 text-xs text-slate-500">当前只投放在公司记录解锁弹窗。用户关闭广告后获得该公司的 24 小时查看权限。</p></div>{editingAdId ? <button type="button" onClick={resetAdForm} className="text-xs font-bold text-slate-500">新建广告</button> : null}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-800">广告标题<input value={adTitle} onChange={(event) => setAdTitle(event.target.value)} maxLength={120} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal" /></label><label className="text-sm font-semibold text-slate-800">跳转链接（可选）<input value={adTargetUrl} onChange={(event) => setAdTargetUrl(event.target.value)} placeholder="https://..." className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal" /></label></div><label className="mt-4 block text-sm font-semibold text-slate-800">广告说明<textarea value={adDescription} onChange={(event) => setAdDescription(event.target.value)} maxLength={500} rows={4} className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm font-normal" /></label><label className="mt-4 block text-sm font-semibold text-slate-800">图片地址（可选）<input value={adImageUrl} onChange={(event) => setAdImageUrl(event.target.value)} placeholder="https://.../ad.jpg" className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal" /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-800">开始时间（可选）<input value={adStartAt} onChange={(event) => setAdStartAt(event.target.value)} type="datetime-local" className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal" /></label><label className="text-sm font-semibold text-slate-800">结束时间（可选）<input value={adEndAt} onChange={(event) => setAdEndAt(event.target.value)} type="datetime-local" className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal" /></label></div><button type="button" onClick={() => void saveAd()} disabled={!adTitle.trim()} className="mt-5 border-2 border-slate-950 bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{editingAdId ? "保存广告" : "创建广告"}</button></div><div className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-3 text-sm font-bold text-slate-900">广告列表</div>{ads.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">尚未创建广告。未配置广告时，记录页不会阻断用户查看。</p> : <div className="divide-y divide-slate-100">{ads.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="font-semibold text-slate-950">{item.title}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.description || "无广告说明"}</p><p className="mt-2 text-xs text-slate-400">展示 {item.impressionCount} · 完成解锁 {item.completionCount} · 实际解锁 {item._count.unlocks} · {item.enabled ? "投放中" : "已停用"}</p></div><div className="flex gap-2"><button type="button" onClick={() => editAd(item)} className="border border-slate-300 px-3 py-1.5 text-xs font-bold">编辑</button><button type="button" onClick={() => void adAction("updateAd", item)} className="border border-cyan-300 px-3 py-1.5 text-xs font-bold text-cyan-800">{item.enabled ? "停用" : "启用"}</button><button type="button" onClick={() => void adAction("deleteAd", item)} className="border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700">删除</button></div></div>)}</div>}</div></section> : null}

      {activeSection === "backup" ? <section className="space-y-4"><div className="border-2 border-slate-900 bg-white p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="text-lg font-bold text-slate-950">数据库与附件备份</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">备份包包含 SQLite 数据库快照、用户上传图片和还原清单。服务器每小时创建一次，默认保留最近 {backupRetentionHours} 小时；下载后可在新服务器直接恢复。</p></div><button type="button" onClick={() => void createBackup()} disabled={backupCreating} className="shrink-0 border-2 border-slate-950 bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{backupCreating ? "正在打包..." : "立即创建备份"}</button></div>{backupMessage ? <p className="mt-4 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{backupMessage}</p> : null}</div><div className="overflow-x-auto border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><h3 className="font-bold text-slate-950">最近备份</h3><button type="button" onClick={() => void loadBackups()} disabled={backupLoading} className="text-xs font-bold text-cyan-700 disabled:opacity-50">{backupLoading ? "刷新中..." : "刷新"}</button></div>{backups.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-400">尚未找到备份。定时任务运行后或点击“立即创建备份”即可生成。</p> : <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">创建时间</th><th className="px-5 py-3">备份内容</th><th className="px-5 py-3">压缩包大小</th><th className="px-5 py-3"></th></tr></thead><tbody>{backups.map((backup) => <tr key={backup.archiveName} className="border-t border-slate-100"><td className="px-5 py-4 text-slate-700">{new Date(backup.createdAt).toLocaleString("zh-CN")}</td><td className="px-5 py-4 text-slate-600">数据库 {formatBytes(backup.databaseBytes)} · {backup.uploadsIncluded ? `${backup.uploadFileCount} 个附件` : "无附件"}</td><td className="px-5 py-4 font-medium text-slate-900">{formatBytes(backup.archiveBytes)}</td><td className="px-5 py-4 text-right"><a href={`/api/admin/backups?download=${encodeURIComponent(backup.archiveName)}`} className="border border-cyan-300 px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50">下载</a></td></tr>)}</tbody></table>}</div></section> : null}

      {activeSection === "config" ? (
        <div className="space-y-6">
          <section className="border-2 border-cyan-700 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-lg font-bold text-slate-950">OCR.space 配置</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">用于从招聘平台截图中提取文字。密钥只在服务器端使用，不会返回浏览器或提交到 GitHub。</p>
              </div>
              <span className={ocrConfigured ? "border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"}>{ocrConfigured === null ? "检查中" : ocrConfigured ? "密钥已配置" : "尚未配置"}</span>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-800">OCR.space API 密钥<input value={ocrKey} onChange={(event) => setOcrKey(event.target.value)} type="password" placeholder={ocrConfigured ? "已配置，留空表示不修改" : "粘贴 OCR.space API 密钥"} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void saveOCRConfiguration()} disabled={ocrSaving || !ocrKey.trim()} className="border-2 border-slate-950 bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{ocrSaving ? "保存中..." : "保存 OCR 配置"}</button>
              {ocrConfigured ? <button type="button" onClick={async () => { setOcrSaving(true); setOcrMessage(""); try { const response = await fetch("/api/admin/ocr-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearApiKey: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "清除失败"); setOcrConfigured(false); setOcrMessage("已清除数据库中的 OCR 密钥；如果环境变量仍存在，服务仍会继续使用环境变量。"); } catch (error) { setOcrMessage(error instanceof Error ? error.message : "清除失败"); } finally { setOcrSaving(false); } }} disabled={ocrSaving} className="border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">清除后台密钥</button> : null}
            </div>
            {ocrMessage ? <p className="mt-3 border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">{ocrMessage}</p> : null}
          </section>

          {aiConfig ? (
        <section className="mb-6 border-2 border-slate-900 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-lg font-bold text-slate-950">AI 招聘分析配置</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">支持 DeepSeek、智谱 BigModel、OpenRouter 及其他 OpenAI 兼容的 chat/completions 接口。密钥不会返回浏览器。</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={useZhipuPreset} className="border-2 border-indigo-700 bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">使用智谱免费模型</button>
              <span className={aiConfig.apiKeyConfigured ? "border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"}>{aiConfig.apiKeyConfigured ? "密钥已配置" : "尚未配置密钥"}</span>
            </div>
          </div>
          {!aiConfig.encryptionConfigured ? <p className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">服务器未设置 AI_CONFIG_ENCRYPTION_KEY，将使用 ADMIN_PASSWORD 作为加密材料。生产环境建议设置独立的长随机值。</p> : null}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">服务商<input value={aiConfig.provider} onChange={(event) => updateAIConfig("provider", event.target.value)} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
            <label className="text-sm font-semibold text-slate-800">模型名<input value={aiConfig.model} onChange={(event) => updateAIConfig("model", event.target.value)} placeholder="DeepSeek-V4-Flash 或 deepseek-chat" className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-800">完整接口地址<input value={aiConfig.endpoint} onChange={(event) => updateAIConfig("endpoint", event.target.value)} placeholder="https://example.com/v1/chat/completions" className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">API 密钥请求头<input value={aiConfig.apiKeyHeader} onChange={(event) => updateAIConfig("apiKeyHeader", event.target.value)} placeholder="Authorization" className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
            <label className="text-sm font-semibold text-slate-800">API 密钥<input value={aiKey} onChange={(event) => setAIKey(event.target.value)} type="password" placeholder={aiConfig.apiKeyConfigured ? "已配置，留空表示不修改" : "粘贴服务商 API 密钥"} className="mt-2 h-10 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-cyan-600" /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={aiConfig.enabled} onChange={(event) => updateAIConfig("enabled", event.target.checked)} className="h-4 w-4 accent-cyan-600" />启用 AI 增强分析</label>
            <button type="button" onClick={() => void saveAIConfiguration()} disabled={aiSaving} className="border-2 border-slate-950 bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{aiSaving ? "保存中..." : "保存 AI 配置"}</button>
            <button type="button" onClick={() => void testAIConfiguration()} disabled={aiTesting} className="border-2 border-cyan-700 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50">{aiTesting ? "测试中..." : "测试接口"}</button>
          </div>
          {aiMessage ? <p className="mt-3 border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">{aiMessage}</p> : null}
        </section>
          ) : null}
        </div>
      ) : activeSection === "audit" ? (
        <>

      <div className="mb-6 flex gap-2">
        {[
          { value: "PENDING", label: "待审核" },
          { value: "APPROVED", label: "已通过" },
          { value: "REJECTED", label: "已拒绝" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
              (filter === tab.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">加载中...</div>
      ) : error ? (
        <div className="py-12 text-center text-red-500">{error}</div>
      ) : records.length === 0 ? (
        <div className="py-12 text-center text-gray-400">暂无记录</div>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div
              key={record.id}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                    {record.type}
                  </span>
                  <h3 className="mt-1 font-semibold text-gray-900">{record.title}</h3>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {record.company.name} · {new Date(record.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>

              <p className="mb-4 line-clamp-3 whitespace-pre-wrap text-sm text-gray-600">
                {record.content}
              </p>

              {record.rating ? (
                <div className="mb-4 text-sm text-amber-500" aria-label={`${record.rating} 星评分`}>
                  {"★".repeat(record.rating)}{"☆".repeat(5 - record.rating)}
                  <span className="ml-2 text-xs text-gray-400">{record.rating}/5</span>
                </div>
              ) : null}

              {filter === "PENDING" ? (
                <div className="flex gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => handleAction(record.id, "APPROVED")}
                    disabled={actionLoading === record.id}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    通过
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt("请输入拒绝原因（可选）：");
                      handleAction(record.id, "REJECTED", reason || undefined);
                    }}
                    disabled={actionLoading === record.id}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    拒绝
                  </button>
                </div>
              ) : null}

              {filter === "REJECTED" && record.rejectReason ? (
                <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  拒绝原因：{record.rejectReason}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
        </>
      ) : null}
    </div>
  );
}
