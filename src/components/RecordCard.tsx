"use client";

import { useState } from "react";
import type { RecordData } from "@/types";

const typeLabels: Record<string, string> = {
  CHAT_SCREENSHOT: "💬 HR 对话",
  INTERVIEW_EXPERIENCE: "🎯 面试经历",
  JD_SNAPSHOT: "📄 招聘 JD 快照",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return `${Math.floor(diff / 2592000)} 个月前`;
}

export default function RecordCard({ record }: { record: RecordData }) {
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);

  const handleReport = async () => {
    if (reported) return;
    const reason = prompt("请简要说明举报原因（如：内容不实、包含隐私信息等）：");
    if (!reason) return;

    setReporting(true);
    try {
      const res = await fetch("/api/records/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: record.id, reason }),
      });
      if (res.ok) {
        setReported(true);
        alert("举报已提交，感谢你的反馈！");
      } else {
        alert("举报失败，请稍后重试");
      }
    } catch {
      alert("网络错误");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
            {typeLabels[record.type] || record.type}
          </span>
          <h3 className="text-base font-semibold text-gray-900 mt-2">
            {record.title}
          </h3>
        </div>
        <div className="text-right shrink-0 ml-4">
          {record.city && <div className="text-xs text-gray-400">📍 {record.city}</div>}
          <div className="text-xs text-gray-400 mt-0.5">{timeAgo(record.createdAt)}</div>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 leading-relaxed mb-3 whitespace-pre-wrap line-clamp-4">
        {record.content}
      </p>

      {/* Interview details */}
      {record.actualPosition && (
        <div className="flex flex-wrap gap-2 mb-3">
          {record.actualPosition && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              📍 {record.actualPosition}
            </span>
          )}
          {record.salaryRange && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              💰 {record.salaryRange}
            </span>
          )}
          {record.isConsistentWithJD !== null && (
            <span
              className={`text-xs px-2 py-1 rounded ${
                record.isConsistentWithJD
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {record.isConsistentWithJD ? "✅ 与 JD 相符" : "⚠️ 与 JD 不符"}
            </span>
          )}
        </div>
      )}

      {/* Images placeholder */}
      {record.images && record.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {record.images.map((img, i) => (
            <div
              key={i}
              className="shrink-0 w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-2xl"
              title={img}
            >
              🖼️
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end pt-3 mt-2 border-t border-gray-50">
        <button
          onClick={handleReport}
          disabled={reporting || reported}
          className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            reported
              ? "text-green-600 bg-green-50"
              : "text-gray-400 hover:text-red-500 hover:bg-red-50"
          }`}
        >
          {reported ? "✅ 已举报" : reporting ? "..." : "🚩 举报"}
        </button>
      </div>
    </div>
  );
}
