"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { RecordType } from "@/types";
import CityPicker from "@/components/CityPicker";
import LoginDialog from "@/components/LoginDialog";

interface UserInfo {
  id: number;
  identifier: string;
  membershipDays: number;
}

interface SectionState {
  title: string;
  content: string;
  rating: number;
  actualPosition: string;
  salaryRange: string;
  workContent: string;
  isConsistentWithJD: string;
  images: string[];
  submitting: boolean;
  done: boolean;
}

const USER_KEY = "job_insight_user";

const sectionConfig: {
  key: RecordType;
  mark: string;
  label: string;
  description: string;
  titlePlaceholder: string;
  contentPlaceholder: string;
}[] = [
  {
    key: "JD_SNAPSHOT",
    mark: "JD",
    label: "招聘 JD",
    description: "先记录招聘信息和岗位要求",
    titlePlaceholder: "例如：招聘写开发，实际工作以销售为主",
    contentPlaceholder: "写下 JD 中最重要的描述，以及入职或面试后发现的实际情况。",
  },
  {
    key: "CHAT_SCREENSHOT",
    mark: "聊",
    label: "HR 对话",
    description: "留下招聘沟通中的关键信息",
    titlePlaceholder: "例如：HR 回避薪资结构，只强调高提成",
    contentPlaceholder: "可以记录 HR 的原话、承诺和前后不一致的地方。",
  },
  {
    key: "INTERVIEW_EXPERIENCE",
    mark: "面",
    label: "面试经历",
    description: "最后记录流程、面试官和实际感受",
    titlePlaceholder: "例如：面试流程混乱，岗位和 JD 不一致",
    contentPlaceholder: "按时间顺序写下发生了什么，以及哪些细节让你觉得值得提醒后来者。",
  },
];

const emptySection = (): SectionState => ({
  title: "",
  content: "",
  rating: 0,
  actualPosition: "",
  salaryRange: "",
  workContent: "",
  isConsistentWithJD: "",
  images: [],
  submitting: false,
  done: false,
});

const initialSections: Record<RecordType, SectionState> = {
  CHAT_SCREENSHOT: emptySection(),
  INTERVIEW_EXPERIENCE: emptySection(),
  JD_SNAPSHOT: emptySection(),
};

function ImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setError("仅支持 PNG、JPEG、WebP 或 GIF 图片");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("单张图片不能超过 10MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) setError(data.error || "图片上传失败");
      else onChange([...images, data.url]);
    } catch {
      setError("图片上传失败，请稍后再试");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-800">补充截图</p>
          <p className="mt-1 text-xs text-slate-400">可选，单张不超过 10MB</p>
        </div>
        {images.length > 0 ? <span className="text-xs text-slate-400">{images.length} 张</span> : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {images.map((url, index) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100">
            <Image src={url} alt="上传的记录截图" fill unoptimized className="object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((_, imageIndex) => imageIndex !== index))}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/75 text-lg leading-none text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              aria-label={`移除第 ${index + 1} 张截图`}
            >
              ×
            </button>
          </div>
        ))}
        {images.length < 6 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 transition hover:border-slate-500 hover:bg-white hover:text-slate-700 disabled:cursor-wait disabled:opacity-60"
          >
            {uploading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            ) : (
              <>
                <span className="text-2xl font-light leading-none">+</span>
                <span className="mt-2 text-xs">添加图片</span>
              </>
            )}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginInput, setLoginInput] = useState("");
  const [logging, setLogging] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [activeType, setActiveType] = useState<RecordType>("JD_SNAPSHOT");
  const [sections, setSections] = useState(initialSections);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        setUser(raw ? JSON.parse(raw) : null);
      } catch {
        setUser(null);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const activeSection = sections[activeType];
  const activeConfig = sectionConfig.find((config) => config.key === activeType) || sectionConfig[0];
  const completedCount = Object.values(sections).filter((section) => section.done).length;

  const updateActiveSection = (patch: Partial<SectionState>) => {
    setSections((previous) => ({
      ...previous,
      [activeType]: { ...previous[activeType], ...patch },
    }));
  };

  const handleLogin = async () => {
    const identifier = loginInput.trim();
    if (!identifier) return;
    setLogging(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoginError(data.error || "登录失败");
        return;
      }
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      setShowLogin(false);
      setLoginInput("");
    } catch {
      setLoginError("网络错误，请稍后再试");
    } finally {
      setLogging(false);
    }
  };

  const submitActiveSection = async () => {
    const company = companyName.trim();
    const title = activeSection.title.trim();
    const content = activeSection.content.trim();
    setFormError("");
    setSuccessMessage("");
    if (!company) return setFormError("请先填写公司名称");
    if (!city) return setFormError("请选择所在城市");
    if (!title) return setFormError("请给这条记录写一个标题");
    if (content.length < 10) return setFormError("详细内容至少填写 10 个字，让这条记录对别人有帮助");
    if (!activeSection.rating) return setFormError("请先选择 1-5 星评分");

    updateActiveSection({ submitting: true });
    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeType,
          companyName: company,
          city,
          userId: user?.id,
          title,
          content,
          rating: activeSection.rating,
          images: activeSection.images,
          actualPosition: activeSection.actualPosition || undefined,
          salaryRange: activeSection.salaryRange || undefined,
          workContent: activeSection.workContent || undefined,
          isConsistentWithJD:
            activeSection.isConsistentWithJD === "yes"
              ? true
              : activeSection.isConsistentWithJD === "no"
              ? false
              : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error || "提交失败，请稍后再试");
        return;
      }
      setSections((previous) => ({
        ...previous,
        [activeType]: { ...previous[activeType], submitting: false, done: true },
      }));
      setSuccessMessage("已收到这条记录，审核通过后会展示给其他求职者。");
    } catch {
      setFormError("网络错误，请稍后再试");
    } finally {
      updateActiveSection({ submitting: false });
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 sm:py-28">
        <div className="border-y border-slate-200 py-12 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">贡献记录</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">先登录，再分享经历</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-500">你的记录会关联到账号，方便后续查看提交状态。</p>
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-7 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            登录 / 注册
          </button>
        </div>
        <LoginDialog
          open={showLogin}
          title="登录 BillieJob"
          description="输入手机号或邮箱即可登录，新用户会自动注册。"
          value={loginInput}
          error={loginError}
          loading={logging}
          onChange={setLoginInput}
          onClose={() => {
            setShowLogin(false);
            setLoginError("");
            setLoginInput("");
          }}
          onSubmit={handleLogin}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">贡献记录</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">把一次经历，写成下一次选择的依据</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">只记录事实和细节，不替别人下结论。越具体，越能帮到正在找工作的人。</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-2xl font-semibold text-slate-950">{completedCount}/3</p>
          <p className="mt-1 text-xs text-slate-400">已提交记录</p>
        </div>
      </header>

      <main className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div>
          <section className="border-b border-slate-200 pb-8">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">1</span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">先确定这段经历</h2>
                <p className="mt-1 text-sm text-slate-500">公司和城市只需填写一次，下面的记录会自动共用。</p>
              </div>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
              <label className="block">
                <span className="text-sm font-medium text-slate-800">公司名称 <em className="not-italic text-red-500">*</em></span>
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="输入公司全称或品牌名"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-800">所在城市 <em className="not-italic text-red-500">*</em></span>
                <div className="mt-2"><CityPicker value={city} onChange={setCity} /></div>
              </label>
            </div>
          </section>

          <section className="pt-8">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">2</span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">选择记录类型</h2>
                <p className="mt-1 text-sm text-slate-500">一次先写好一条，也可以继续补充其他类型。</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {sectionConfig.map((config) => {
                const section = sections[config.key];
                const selected = activeType === config.key;
                return (
                  <button
                    key={config.key}
                    type="button"
                    onClick={() => {
                      setActiveType(config.key);
                      setFormError("");
                      setSuccessMessage("");
                    }}
                    className={`min-h-28 rounded-2xl border p-4 text-left transition ${selected ? "border-slate-950 bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.14)]" : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"}`}
                  >
                    <span className={`text-xs font-semibold tracking-[0.16em] ${selected ? "text-slate-300" : "text-slate-400"}`}>{config.mark}</span>
                    <span className="mt-3 block text-sm font-semibold">{config.label}</span>
                    <span className={`mt-1 block text-xs leading-5 ${selected ? "text-slate-300" : "text-slate-500"}`}>{section.done ? "已提交，可继续查看其他类型" : config.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 border-t border-slate-200 pt-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{activeConfig.label}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">写下你希望别人提前知道的事</h2>
                </div>
                {activeSection.done ? <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">已提交</span> : null}
              </div>

              {activeSection.done ? (
                <div className="mt-6 border border-emerald-200 bg-emerald-50/70 p-5 text-sm leading-6 text-emerald-800">这条记录已经提交，审核通过后会出现在公司页面。你可以选择上方其他类型继续补充。</div>
              ) : (
                <div className="mt-6 space-y-6">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-800">一句话标题 <em className="not-italic text-red-500">*</em></span>
                    <input
                      type="text"
                      value={activeSection.title}
                      onChange={(event) => updateActiveSection({ title: event.target.value })}
                      placeholder={activeConfig.titlePlaceholder}
                      className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-800">详细内容 <em className="not-italic text-red-500">*</em></span>
                    <textarea
                      value={activeSection.content}
                      onChange={(event) => updateActiveSection({ content: event.target.value })}
                      placeholder={activeConfig.contentPlaceholder}
                      rows={7}
                      className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                    />
                    <span className="mt-2 block text-xs text-slate-400">不要包含姓名、电话、住址等个人隐私信息。</span>
                  </label>

                  <div className="border-t border-slate-200 pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-800">这段经历整体评分 <em className="not-italic text-red-500">*</em></p>
                        <p className="mt-1 text-xs text-slate-400">1 星最低，5 星最高</p>
                      </div>
                      <span className="text-sm font-medium text-slate-500">{activeSection.rating ? `${activeSection.rating} / 5` : "未评分"}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="经历评分">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          role="radio"
                          aria-checked={activeSection.rating === star}
                          aria-label={`${star} 星`}
                          onClick={() => updateActiveSection({ rating: star })}
                          className={`text-3xl leading-none transition hover:scale-110 ${star <= activeSection.rating ? "text-amber-400" : "text-slate-300"}`}
                        >
                          {star <= activeSection.rating ? "★" : "☆"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeType === "INTERVIEW_EXPERIENCE" ? (
                    <div className="space-y-6 border-t border-slate-200 pt-6">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <label className="block"><span className="text-sm font-medium text-slate-800">实际岗位</span><input type="text" value={activeSection.actualPosition} onChange={(event) => updateActiveSection({ actualPosition: event.target.value })} placeholder="例如：Java 后端开发" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900" /></label>
                        <label className="block"><span className="text-sm font-medium text-slate-800">薪资范围</span><input type="text" value={activeSection.salaryRange} onChange={(event) => updateActiveSection({ salaryRange: event.target.value })} placeholder="例如：8K-13K" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900" /></label>
                      </div>
                      <label className="block"><span className="text-sm font-medium text-slate-800">实际工作内容</span><input type="text" value={activeSection.workContent} onChange={(event) => updateActiveSection({ workContent: event.target.value })} placeholder="例如：除了开发，还需要承担销售和运维" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900" /></label>
                      <div>
                        <span className="text-sm font-medium text-slate-800">实际工作与 JD 是否相符</span>
                        <div className="mt-3 flex gap-3">
                          {[{ value: "yes", label: "相符" }, { value: "no", label: "不相符" }].map((option) => (
                            <button key={option.value} type="button" onClick={() => updateActiveSection({ isConsistentWithJD: option.value })} className={`rounded-full border px-5 py-2 text-sm transition ${activeSection.isConsistentWithJD === option.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{option.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t border-slate-200 pt-6"><ImageUploader images={activeSection.images} onChange={(images) => updateActiveSection({ images })} /></div>
                  {formError ? <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p> : null}
                  {successMessage ? <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p> : null}
                  <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center">
                    <p className="text-xs leading-5 text-slate-400">提交后会进入审核，不会立即公开。</p>
                    <button type="button" onClick={submitActiveSection} disabled={activeSection.submitting} className="inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-7 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">{activeSection.submitting ? "提交中..." : "提交这条记录"}</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-t border-slate-200 pt-5">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">记录原则</p>
            <ul className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
              <li><strong className="font-medium text-slate-900">写事实。</strong>时间、流程、原话和实际变化比情绪更有参考价值。</li>
              <li><strong className="font-medium text-slate-900">去隐私。</strong>发布前检查截图中的姓名、电话和地址。</li>
              <li><strong className="font-medium text-slate-900">讲具体。</strong>一条清楚的经历，比笼统的“好”或“差”更有用。</li>
            </ul>
            <button type="button" onClick={() => router.push("/")} className="mt-8 text-sm text-slate-400 transition hover:text-slate-900">返回首页</button>
          </div>
        </aside>
      </main>
    </div>
  );
}
