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

export default function AdminDashboard() {
  const router = useRouter();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("PENDING");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

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
