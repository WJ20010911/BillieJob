"use client";

import { useEffect, useMemo, useState } from "react";
import LoginDialog from "@/components/LoginDialog";
import type { CompanyExternalProfile } from "@/lib/company-profile";
import type { RecordData, RecordType } from "@/types";

interface CompanyInfo {
  id: number;
  name: string;
  alias: string | null;
  description: string | null;
  industry: string | null;
  businessInfo: string | null;
  score: number;
  riskTags: string[];
  recordCount: number;
  cities: string[];
  createdAt: string;
  externalProfile: CompanyExternalProfile;
  ratingSummary: {
    average: number | null;
    count: number;
    byType: Partial<Record<RecordType, { average: number; count: number }>>;
  };
}

interface RecordPageAd {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
}

const ratingTypeLabels: Record<RecordType, string> = {
  JD_SNAPSHOT: "招聘信息",
  CHAT_SCREENSHOT: "HR 对话",
  INTERVIEW_EXPERIENCE: "面试经历",
};

const workflowTypes: RecordType[] = ["JD_SNAPSHOT", "CHAT_SCREENSHOT", "INTERVIEW_EXPERIENCE"];

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function RatingStars({ rating }: { rating: number | null }) {
  const filled = rating ? Math.round(rating) : 0;
  return (
    <span className="tracking-[0.12em] text-amber-400" aria-label={rating ? `${rating.toFixed(1)} 分` : "暂无评分"}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star}>{star <= filled ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = "bg-red-100 text-red-700";
  let label = "谨慎";
  if (score >= 70) {
    color = "bg-emerald-100 text-emerald-700";
    label = "较稳";
  } else if (score >= 40) {
    color = "bg-amber-100 text-amber-700";
    label = "留意";
  }

  return (
    <div className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium " + color}>
      <span className="text-base">{score}</span>
      <span>{label}</span>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: CompanyExternalProfile["items"][number]["impact"] }) {
  const styles = {
    critical: "bg-red-50 text-red-700 border-red-100",
    high: "bg-amber-50 text-amber-700 border-amber-100",
    medium: "bg-sky-50 text-sky-700 border-sky-100",
    low: "bg-slate-100 text-slate-600 border-slate-200",
  } as const;

  const labels = {
    critical: "高影响",
    high: "重点看",
    medium: "辅助判断",
    low: "补充信息",
  } as const;

  return (
    <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-medium " + styles[impact]}>
      {labels[impact]}
    </span>
  );
}

export default function CompanyPageClient({
  company,
  initialCity,
  initialRecords,
}: {
  company: CompanyInfo;
  initialCity: string;
  initialRecords: RecordData[];
}) {
  const [allRecords] = useState<RecordData[]>(initialRecords);
  const [showContent, setShowContent] = useState(false);
  const [selectedCity, setSelectedCity] = useState(initialCity);
  const [selectedPosition, setSelectedPosition] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [loginInput, setLoginInput] = useState("");
  const [logging, setLogging] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [favorited, setFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [ad, setAd] = useState<RecordPageAd | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [adError, setAdError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem("job_insight_user");
        if (!raw) return;
        const currentUser = JSON.parse(raw) as { id: number; membershipDays?: number };
        if ((currentUser.membershipDays || 0) > 0) setShowContent(true);
        void fetch(`/api/account/favorites?kind=company&id=${company.id}`, {
          headers: { "x-user-id": String(currentUser.id) },
        }).then((response) => response.ok ? response.json() : null).then((result) => {
          if (result) setFavorited(Boolean(result.favorited));
        });
        void fetch("/api/account/history", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": String(currentUser.id) },
          body: JSON.stringify({ companyId: company.id }),
        });
      } catch {
        // Ignore stale local account data.
      }
      void fetch(`/api/ads?companyId=${company.id}`).then((response) => response.ok ? response.json() : null).then((result) => {
        if (!result) return;
        if (result.ad) setAd(result.ad as RecordPageAd);
        else setShowContent(true);
        if (result.unlocked) setShowContent(true);
      }).catch(() => setShowContent(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [company.id]);

  const cityRecords = selectedCity
    ? allRecords.filter((record) => record.city === selectedCity)
    : allRecords;

  const otherCityRecords = selectedCity
    ? allRecords.filter((record) => record.city && record.city !== selectedCity)
    : [];

  const hasRecordsInCity = cityRecords.length > 0;
  const displayRecords = hasRecordsInCity ? cityRecords : allRecords;
  const availableCities = [...new Set(allRecords.map((record) => record.city).filter(Boolean))];
  const positionOf = (record: RecordData) => record.position || record.actualPosition || "岗位未填写";
  const availablePositions = [...new Set(displayRecords.map(positionOf))];
  const positionRecords = selectedPosition ? displayRecords.filter((record) => positionOf(record) === selectedPosition) : displayRecords;
  const recordsByPosition = positionRecords.reduce<Record<string, RecordData[]>>((groups, record) => {
    const key = positionOf(record);
    (groups[key] ||= []).push(record);
    return groups;
  }, {});
  const contributorRows = (records: RecordData[]) => Object.values(records.reduce<Record<string, RecordData[]>>((groups, record) => {
    const key = record.uploaderId || `anonymous-${record.id}`;
    (groups[key] ||= []).push(record);
    return groups;
  }, {})).sort((left, right) => new Date(right[0].createdAt).getTime() - new Date(left[0].createdAt).getTime());

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
        setShowLogin(false);
        setLoginInput("");
        setShowContent(true);
      } else {
        setLoginError(data.error || "登录失败");
      }
    } catch {
      setLoginError("网络错误，请稍后重试");
    } finally {
      setLogging(false);
    }
  };

  const handleSkipAd = () => {
    try {
      const raw = localStorage.getItem("job_insight_user");
      if (raw) {
        const user = JSON.parse(raw);
        if (user.membershipDays > 0) {
          setShowContent(true);
          return;
        }
      }
    } catch {
      // ignore
    }
    setShowLogin(true);
  };

  const openAd = () => {
    if (ad) { setAdError(""); setShowAd(true); } else setShowContent(true);
  };

  const completeAd = async () => {
    if (!ad) { setShowContent(true); setShowAd(false); return; }
    setAdLoading(true); setAdError("");
    try {
      const raw = localStorage.getItem("job_insight_user");
      const user = raw ? JSON.parse(raw) as { id: number } : null;
      const response = await fetch("/api/ads", { method: "POST", headers: { "Content-Type": "application/json", ...(user ? { "x-user-id": String(user.id) } : {}) }, body: JSON.stringify({ adId: ad.id, companyId: company.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "广告解锁失败");
      setShowAd(false); setShowContent(true);
    } catch (error) { setAdError(error instanceof Error ? error.message : "广告解锁失败"); } finally { setAdLoading(false); }
  };

  const toggleFavorite = async () => {
    if (favoriteLoading) return;
    let currentUser: { id: number } | null = null;
    try {
      const raw = localStorage.getItem("job_insight_user");
      currentUser = raw ? JSON.parse(raw) : null;
    } catch {
      currentUser = null;
    }
    if (!currentUser) {
      setShowLogin(true);
      return;
    }

    setFavoriteLoading(true);
    try {
      const response = await fetch("/api/account/favorites", {
        method: favorited ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", "x-user-id": String(currentUser.id) },
        body: JSON.stringify({ kind: "company", id: company.id }),
      });
      if (response.ok) setFavorited(!favorited);
    } finally {
      setFavoriteLoading(false);
    }
  };

  const externalItems = useMemo(() => company.externalProfile.items, [company.externalProfile.items]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-slate-950">{company.name}</h1>
            {company.alias ? <p className="mt-1 text-sm text-slate-500">简称：{company.alias}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {company.industry ? (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-600">
                  {company.industry}
                </span>
              ) : null}
              <ScoreBadge score={company.score} />
              <span className="text-sm text-slate-400">{allRecords.length} 条记录</span>
              {company.cities.length > 0 ? (
                <span className="text-sm text-slate-400">{company.cities.slice(0, 3).join(" · ")}</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void toggleFavorite()}
            disabled={favoriteLoading}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${favorited ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
            title={favorited ? "取消收藏公司" : "收藏公司"}
          >
            {favorited ? "★ 已收藏" : "☆ 收藏公司"}
          </button>
        </div>

        {company.description ? (
          <p className="mt-4 text-sm leading-6 text-slate-600">{company.description}</p>
        ) : null}

        {company.riskTags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {company.riskTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-700"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">用户体验评分</p>
              <p className="mt-1 text-xs text-slate-400">基于已通过审核的用户记录</p>
            </div>
            <div className="flex items-center gap-3">
              <RatingStars rating={company.ratingSummary.average} />
              <span className="text-lg font-semibold text-slate-950">
                {company.ratingSummary.average ? company.ratingSummary.average.toFixed(1) : "暂无"}
                <span className="ml-1 text-xs font-normal text-slate-400">/ 5</span>
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(Object.keys(ratingTypeLabels) as RecordType[]).map((type) => {
              const summary = company.ratingSummary.byType[type];
              return (
                <div key={type} className="rounded-xl bg-slate-50 px-3 py-3 text-center">
                  <p className="text-xs text-slate-500">{ratingTypeLabels[type]}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {summary ? `${summary.average.toFixed(1)} / 5` : "暂无"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">External profile</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">企业外部数据</h2>
            <p className="mt-2 text-sm text-slate-500">
              劳动争议、法律纠纷、社保人数等指标会按对入职影响排序显示。
            </p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>数据源：{company.externalProfile.provider || "待接入"}</div>
            <div>更新时间：{company.externalProfile.updatedAt || "未同步"}</div>
          </div>
        </div>

        {externalItems.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {externalItems.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</div>
                  </div>
                  <ImpactBadge impact={item.impact} />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">{item.note}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm leading-7 text-slate-500">
            这一块已经预留好外部企业数据入口。接入企查查、天眼查或同类数据源后，这里会优先展示劳动争议、法律纠纷、被执行信息、社保参保人数等对入职判断最关键的指标。
          </div>
        )}

        {company.externalProfile.rawSummary ? (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
            {company.externalProfile.rawSummary}
          </div>
        ) : null}
      </div>

      {availableCities.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">城市筛选：</span>
          <button
            onClick={() => setSelectedCity("")}
            className={
              "rounded-lg px-3 py-1.5 text-sm transition-colors " +
              (!selectedCity ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            全部
          </button>
          {availableCities.map((city) => (
            <button
              key={city}
              onClick={() => setSelectedCity(city)}
              className={
                "rounded-lg px-3 py-1.5 text-sm transition-colors " +
                (selectedCity === city
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {city}
            </button>
          ))}
        </div>
      ) : null}

      {selectedCity && !hasRecordsInCity && allRecords.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>{selectedCity} 暂无记录</strong>
          <p className="mt-1">以下展示的是这家公司在其他城市的记录，仅供参考。</p>
        </div>
      ) : null}

      {selectedCity && hasRecordsInCity && otherCityRecords.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-700">
          当前只显示 <strong>{selectedCity}</strong> 的记录。
          <button onClick={() => setSelectedCity("")} className="ml-2 underline hover:no-underline">
            查看全部
          </button>
        </div>
      ) : null}

      {availablePositions.length > 0 ? (
        <div className="mb-6 border-y border-slate-100 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-slate-500">岗位分类：</span>
            <button type="button" onClick={() => setSelectedPosition("")} className={`border px-3 py-1.5 text-sm transition ${!selectedPosition ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>全部</button>
            {availablePositions.map((position) => <button key={position} type="button" onClick={() => setSelectedPosition(position)} className={`border px-3 py-1.5 text-sm transition ${selectedPosition === position ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{position}</button>)}
          </div>
        </div>
      ) : null}

      <h2 className="mb-4 text-lg font-semibold text-slate-950">
        用户记录
        <span className="ml-2 text-sm font-normal text-slate-400">({positionRecords.length} 条)</span>
      </h2>

      {!showContent && positionRecords.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <h3 className="text-lg font-semibold text-slate-950">查看完整记录</h3>
          <p className="mt-2 text-sm text-slate-500">
            看完广告后可继续查看全部 {positionRecords.length} 条记录；会员可直接跳过。
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={openAd}
              className="rounded-xl bg-slate-950 px-6 py-2.5 font-medium text-white transition hover:bg-slate-800"
            >
              观看广告
            </button>
            <button
              onClick={handleSkipAd}
              className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              会员直达
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">广告模式无需登录，会员可直接查看。</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {positionRecords.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <p>暂时还没有用户记录</p>
            <a href="/upload" className="mt-3 inline-block text-sm text-slate-900 hover:underline">
              去分享第一条经历
            </a>
          </div>
        ) : showContent ? (
          Object.entries(recordsByPosition).map(([position, records]) => <section key={position} className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0"><div className="mb-3 flex items-center gap-3"><h3 className="text-base font-semibold text-slate-950">{position}</h3><span className="text-xs text-slate-400">{records.length} 条记录</span></div><div className="overflow-x-auto border border-slate-200 bg-white"><div className="min-w-[860px]"><div className="grid grid-cols-[150px_repeat(3,minmax(0,1fr))] border-b-2 border-slate-900 bg-slate-50 text-xs font-bold text-slate-600"><div className="px-4 py-3">发布者 / 时间</div>{workflowTypes.map((type) => <div key={type} className="border-l border-slate-200 px-4 py-3">{ratingTypeLabels[type]}</div>)}</div>{contributorRows(records).map((row, rowIndex) => { const newest = row.reduce((latest, item) => new Date(item.createdAt) > new Date(latest.createdAt) ? item : latest, row[0]); return <div key={`${position}-${rowIndex}`} className="grid grid-cols-[150px_repeat(3,minmax(0,1fr))] border-b border-slate-200 last:border-b-0"><div className="bg-slate-50/60 px-4 py-4"><p className="text-sm font-semibold text-slate-900">贡献者 {rowIndex + 1}</p><time className="mt-1 block text-xs leading-5 text-slate-500">{formatPublishedAt(newest.createdAt)}</time><p className="mt-2 text-xs text-slate-400">已发布 {row.length}/3 项</p></div>{workflowTypes.map((type) => { const record = row.find((item) => item.type === type); return <div key={type} className="min-h-36 border-l border-slate-200 p-3">{record ? <a href={`/records/${record.id}`} className="group block h-full border border-slate-200 bg-white p-3 transition hover:border-slate-950 hover:bg-slate-50"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-500">{ratingTypeLabels[type]}</span>{record.rating ? <span className="text-xs font-bold text-amber-500">{'★'.repeat(record.rating)}</span> : null}</div><p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-900 group-hover:text-cyan-800">{record.title}</p><p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{record.content}</p><time className="mt-3 block text-[11px] text-slate-400">{formatPublishedAt(record.createdAt)}</time></a> : <div className="flex h-full min-h-28 items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">尚未发布</div>}</div>; })}</div>; })}</div></div></section>)
        ) : null}
      </div>

      <LoginDialog
        open={showLogin}
        title="登录后跳过广告"
        description="会员登录后可以直接查看完整记录。"
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
      {showAd && ad ? <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 px-4 py-6" role="dialog" aria-modal="true" aria-label="推广内容"><div className="w-full max-w-md border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><span className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">推广内容</span><h2 className="mt-1 text-lg font-bold text-slate-950">{ad.title}</h2></div><button type="button" onClick={() => void completeAd()} disabled={adLoading} className="h-8 w-8 text-xl text-slate-500 hover:bg-slate-100" aria-label="关闭广告">×</button></div>{ad.imageUrl ? <img src={ad.imageUrl} alt={ad.title} className="max-h-64 w-full object-contain bg-slate-50" /> : null}<div className="p-5"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{ad.description || "感谢查看推广内容。关闭后即可查看公司记录。"}</p>{ad.targetUrl ? <a href={ad.targetUrl} target="_blank" rel="nofollow sponsored noreferrer" className="mt-3 inline-block text-xs text-cyan-700 underline">查看推广详情</a> : null}{adError ? <p className="mt-3 text-sm text-red-600">{adError}</p> : null}<button type="button" onClick={() => void completeAd()} disabled={adLoading} className="mt-5 w-full bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{adLoading ? "解锁中..." : "关闭广告并查看记录"}</button></div></div></div> : null}
    </div>
  );
}
