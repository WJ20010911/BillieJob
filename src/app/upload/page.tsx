"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RecordType } from "@/types";
import CityPicker from "@/components/CityPicker";

interface SectionState {
  expanded: boolean;
  title: string;
  content: string;
  actualPosition: string;
  salaryRange: string;
  workContent: string;
  isConsistentWithJD: string; // "yes" | "no" | ""
  images: string[];
  submitting: boolean;
  done: boolean;
}

type SectionKey = RecordType;

const sectionConfig: { key: SectionKey; icon: string; label: string; desc: string }[] = [
  { key: "CHAT_SCREENSHOT", icon: "💬", label: "HR 对话记录", desc: "上传与 HR 的聊天截图或文字记录" },
  { key: "INTERVIEW_EXPERIENCE", icon: "🎯", label: "面试经历", desc: "分享面试过程中的真实体验" },
  { key: "JD_SNAPSHOT", icon: "📄", label: "招聘 JD 快照", desc: "截图或记录招聘信息，对比实际岗位" },
];

function initSection(): SectionState {
  return {
    expanded: false,
    title: "",
    content: "",
    actualPosition: "",
    salaryRange: "",
    workContent: "",
    isConsistentWithJD: "",
    images: [],
    submitting: false,
    done: false,
  };
}

function ImageUploader({
  images,
  onImagesChange,
  label,
}: {
  images: string[];
  onImagesChange: (urls: string[]) => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      alert("仅支持 PNG/JPEG/WebP/GIF 格式");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("文件大小不能超过 10MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        onImagesChange([...images, data.url]);
      } else {
        alert(data.error || "上传失败");
      }
    } catch {
      alert("图片上传失败");
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <div key={i} className="relative w-20 h-20 bg-gray-100 rounded-lg overflow-hidden group">
            <div className="w-full h-full flex items-center justify-center text-2xl bg-gray-50">
              🖼️
            </div>
            <button
              type="button"
              onClick={() => removeImage(i)}
              className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <span className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          ) : (
            <>
              <span className="text-lg">+</span>
              <span className="text-[10px] mt-0.5">上传</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; identifier: string; membershipDays: number } | null>(() => {
    try {
      const raw = localStorage.getItem("job_insight_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [showLogin, setShowLogin] = useState(false);
  const [loginInput, setLoginInput] = useState("");
  const [logging, setLogging] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>({
    CHAT_SCREENSHOT: initSection(),
    INTERVIEW_EXPERIENCE: initSection(),
    JD_SNAPSHOT: initSection(),
  });

  // Current user is loaded lazily from localStorage on the client.

  const handleLogin = async () => {
    const trimmed = loginInput.trim();
    if (!trimmed) return;
    setLogging(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("job_insight_user", JSON.stringify(data.user));
        setUser(data.user);
        setShowLogin(false);
        setLoginInput("");
      } else {
        setLoginError(data.error || "登录失败");
      }
    } catch {
      setLoginError("网络错误，请稍后重试");
    } finally {
      setLogging(false);
    }
  };

  const toggleSection = (key: SectionKey) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: !prev[key].expanded },
    }));
  };

  const updateField = (
    key: SectionKey,
    field: keyof SectionState,
    value: string | boolean | string[]
  ) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const submitSection = async (key: SectionKey) => {
    const section = sections[key];
    if (!companyName || !city || !section.title || !section.content) {
      alert("请填写公司名称、所在城市、标题和内容");
      return;
    }

    updateField(key, "submitting", true);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: key,
          companyName,
          city: city || undefined,
          userId: (() => { try { const u = JSON.parse(localStorage.getItem("job_insight_user") || "{}"); return u.id; } catch { return undefined; } })(),
          title: section.title,
          content: section.content,
          images: section.images,
          actualPosition: section.actualPosition || undefined,
          salaryRange: section.salaryRange || undefined,
          workContent: section.workContent || undefined,
          isConsistentWithJD:
            section.isConsistentWithJD === "yes"
              ? true
              : section.isConsistentWithJD === "no"
              ? false
              : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateField(key, "done", true);
        updateField(key, "expanded", false);
        // Refresh user info to get updated membership
        const raw = localStorage.getItem("job_insight_user");
        if (raw) {
          const user = JSON.parse(raw);
          user.membershipDays = (user.membershipDays || 0);
          localStorage.setItem("job_insight_user", JSON.stringify(user));
        }
      } else {
        alert(data.error || "提交失败");
      }
    } catch {
      alert("网络错误，请稍后重试");
    } finally {
      updateField(key, "submitting", false);
    }
  };

  // --- Login gate: not logged in ---
  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">请先登录</h1>
        <p className="text-gray-500 mb-8">分享求职经历需要先登录账号</p>
        <button
          onClick={() => setShowLogin(true)}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          登录 / 注册
        </button>

        {showLogin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">登录 / 注册</h2>
                <button onClick={() => { setShowLogin(false); setLoginError(""); setLoginInput(""); }}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号或邮箱</label>
                <input type="text" value={loginInput} onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="输入手机号或邮箱" onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                <p className="text-xs text-gray-400 mt-1.5">无需密码，输入后直接登录。新用户自动注册。</p>
              </div>
              {loginError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{loginError}</p>}
              <button onClick={handleLogin} disabled={logging || !loginInput.trim()}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50">
                {logging ? "登录中..." : "登录 / 注册"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">分享求职经历</h1>
      <p className="text-gray-500 mb-6">你的分享将帮助更多求职者避坑 🛡️</p>

      {/* Shared company name */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          公司名称 <span className="text-red-500">*</span>
          <span className="text-gray-400 font-normal ml-1">（只需填一次，所有板块同步）</span>
        </label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="输入公司全称"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />

        {/* City selector */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            所在城市 <span className="text-red-500">*</span>
          </label>
          <CityPicker value={city} onChange={setCity} />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sectionConfig.map(({ key, icon, label, desc }) => {
          const section = sections[key];
          return (
            <div
              key={key}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                section.done
                  ? "border-green-200 bg-green-50/30"
                  : section.expanded
                  ? "border-blue-200"
                  : "border-gray-100 hover:border-gray-200"
              }`}
            >
              {/* Header — click to toggle */}
              <button
                type="button"
                onClick={() => !section.done && toggleSection(key)}
                className={`w-full flex items-center gap-3 px-5 py-4 text-left ${
                  section.done ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span className="text-2xl">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{label}</div>
                  <div className="text-sm text-gray-400">{desc}</div>
                </div>
                {section.done ? (
                  <span className="text-green-600 text-sm font-medium shrink-0">✅ 已提交</span>
                ) : (
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ${
                      section.expanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* Expandable content */}
              {section.expanded && !section.done && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      标题 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateField(key, "title", e.target.value)}
                      placeholder="例如：面试体验极差，HR 不专业"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      详细内容 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={section.content}
                      onChange={(e) => updateField(key, "content", e.target.value)}
                      placeholder="请详细描述你的经历"
                      rows={4}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">请勿包含个人隐私信息（姓名、电话、地址等）</p>
                  </div>

                  {/* Image uploader */}
                  <ImageUploader
                    images={section.images}
                    onImagesChange={(urls) => updateField(key, "images", urls)}
                    label="上传截图（可选）"
                  />

                  {/* Interview-specific fields */}
                  {key === "INTERVIEW_EXPERIENCE" && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">实际岗位</label>
                          <input
                            type="text"
                            value={section.actualPosition}
                            onChange={(e) => updateField(key, "actualPosition", e.target.value)}
                            placeholder="例如：Java 后端开发"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">薪资范围</label>
                          <input
                            type="text"
                            value={section.salaryRange}
                            onChange={(e) => updateField(key, "salaryRange", e.target.value)}
                            placeholder="例如：8K-13K"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          实际工作内容
                        </label>
                        <input
                          type="text"
                          value={section.workContent}
                          onChange={(e) => updateField(key, "workContent", e.target.value)}
                          placeholder="实际做的工作"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          是否与招聘 JD 相符？
                        </label>
                        <div className="flex gap-3">
                          {[
                            { value: "yes", label: "✅ 相符" },
                            { value: "no", label: "❌ 不符" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateField(key, "isConsistentWithJD", opt.value)}
                              className={`px-4 py-2 rounded-lg border text-sm ${
                                section.isConsistentWithJD === opt.value
                                  ? "border-blue-500 bg-blue-50 text-blue-700"
                                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => submitSection(key)}
                      disabled={section.submitting}
                      className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {section.submitting ? (
                        <>
                          <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                          提交中...
                        </>
                      ) : (
                        "提交此记录"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tip */}
      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        <strong>💡 提示：</strong>公司名称只需填一次，所有板块自动同步。
        可以同时展开多个分类分别填写，每提交一条有效记录可获得 <strong>1 天免广告权益</strong>。
      </div>

      {/* Back link */}
      <div className="mt-6 text-center">
        <button
          onClick={() => router.push("/")}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← 返回首页
        </button>
      </div>
    </div>
  );
}
