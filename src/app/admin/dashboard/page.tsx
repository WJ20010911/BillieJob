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

export default function AdminDashboard() {
  const router = useRouter();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("PENDING");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [ocrConfigured, setOcrConfigured] = useState<boolean | null>(null);
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null);
  const [aiKey, setAIKey] = useState("");
  const [aiSaving, setAISaving] = useState(false);
  const [aiTesting, setAITesting] = useState(false);
  const [aiMessage, setAIMessage] = useState("");

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
    fetch("/api/analyze/ocr")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setOcrConfigured(Boolean(data.configured));
      })
      .catch(() => setOcrConfigured(false));
  }, []);

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
        <h1 className="text-2xl font-bold text-gray-900">内容审核</h1>
      </div>

      <div className="mb-6 border-2 border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
        <div className="font-bold">OCR.space 服务状态</div>
        <div className="mt-1 text-xs text-cyan-800">
          {ocrConfigured === null ? "正在检查配置..." : ocrConfigured ? "已配置。密钥仅存在服务器环境变量中，浏览器和 GitHub 都不会看到。" : "未配置。请在服务器 .env.local 中设置 OCR_SPACE_API_KEY，管理员页面不会保存或显示密钥。"}
        </div>
      </div>

      {aiConfig ? (
        <section className="mb-6 border-2 border-slate-900 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-lg font-bold text-slate-950">AI 招聘分析配置</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">支持 DeepSeek、OpenRouter 及其他 OpenAI 兼容的 chat/completions 接口。密钥不会返回浏览器。</p>
            </div>
            <span className={aiConfig.apiKeyConfigured ? "border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"}>{aiConfig.apiKeyConfigured ? "密钥已配置" : "尚未配置密钥"}</span>
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
    </div>
  );
}
