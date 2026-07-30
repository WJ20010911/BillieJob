"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Tab = "records" | "history" | "favorites" | "profile" | "redeem";

interface AccountUser {
  id: number;
  identifier: string;
  nickname: string | null;
  membershipDays: number;
}

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  content: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface RecordItem {
  id: number;
  type: string;
  title: string;
  content: string;
  rating: number | null;
  status: string;
  rejectReason: string | null;
  city: string;
  createdAt: string;
  company: { id: number; name: string };
}

interface AccountData {
  user: AccountUser;
  notifications: NotificationItem[];
  unreadCount: number;
  records: RecordItem[];
  favoriteCompanies: Array<{
    id: number;
    createdAt: string;
    company: { id: number; name: string; alias: string | null; industry: string | null; score: number };
  }>;
  favoriteRecords: Array<{ id: number; createdAt: string; record: RecordItem }>;
  browseHistory: Array<{
    id: number;
    createdAt: string;
    company: { id: number; name: string } | null;
    record: RecordItem | null;
  }>;
}

const USER_KEY = "job_insight_user";
const tabs: Array<{ key: Tab; label: string }> = [
  { key: "records", label: "提交记录" },
  { key: "history", label: "浏览历史" },
  { key: "favorites", label: "收藏" },
  { key: "profile", label: "账号资料" },
  { key: "redeem", label: "兑换会员" },
];

const typeLabels: Record<string, string> = {
  JD_SNAPSHOT: "招聘 JD",
  CHAT_SCREENSHOT: "HR 对话",
  INTERVIEW_EXPERIENCE: "面试经历",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "APPROVED") return { text: "已通过", style: "bg-emerald-50 text-emerald-700" };
  if (status === "REJECTED") return { text: "未通过", style: "bg-red-50 text-red-700" };
  return { text: "待审核", style: "bg-amber-50 text-amber-700" };
}

function RecordLine({ record }: { record: RecordItem }) {
  const status = statusLabel(record.status);
  return (
    <div className="border-b border-slate-100 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={`/companies/${record.company.id}`} className="text-sm font-medium text-slate-950 hover:underline">
            {record.company.name}
          </a>
          <p className="mt-1 text-sm text-slate-700">{record.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{record.content}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>{status.text}</span>
          {record.rating ? <span className="text-xs text-amber-500">{"★".repeat(record.rating)}</span> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>{typeLabels[record.type] || record.type}</span>
        {record.city ? <span>{record.city}</span> : null}
        <span>{formatDate(record.createdAt)}</span>
      </div>
      {record.status === "REJECTED" && record.rejectReason ? (
        <p className="mt-2 text-xs text-red-600">原因：{record.rejectReason}</p>
      ) : null}
    </div>
  );
}

export default function AccountPage() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [data, setData] = useState<AccountData | null>(null);
  const [tab, setTab] = useState<Tab>("records");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const loadAccount = async (userId: number) => {
    setLoading(true);
    try {
      const response = await fetch("/api/account", { headers: { "x-user-id": String(userId) } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "获取账户信息失败");
      setData(result);
      setUser(result.user);
      setNickname(result.user.nickname || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "获取账户信息失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        const stored = raw ? JSON.parse(raw) as AccountUser : null;
        setUser(stored);
        if (stored) void loadAccount(stored.id);
        else setLoading(false);
      } catch {
        setLoading(false);
      }
      const requestedTab = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (requestedTab && tabs.some((item) => item.key === requestedTab)) setTab(requestedTab);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const unread = data?.notifications.filter((item) => !item.readAt).length || 0;

  const redeem = async () => {
    if (!user || !redeemCode.trim()) return;
    setRedeeming(true); setMessage("");
    try {
      const response = await fetch("/api/account/redeem", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": String(user.id) }, body: JSON.stringify({ code: redeemCode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Redeem failed");
      const nextUser = result.user as AccountUser;
      setUser(nextUser); setData((previous) => previous ? { ...previous, user: nextUser } : previous); localStorage.setItem(USER_KEY, JSON.stringify(nextUser)); setRedeemCode(""); setMessage(`Redeemed ${result.days} membership days.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Redeem failed"); } finally { setRedeeming(false); }
  };

  const changeTab = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, "", `/account?tab=${next}`);
  };

  const markRead = async (id?: number) => {
    if (!user) return;
    const response = await fetch("/api/account/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    if (response.ok) {
      setData((previous) => previous ? {
        ...previous,
        unreadCount: id ? Math.max(0, previous.unreadCount - 1) : 0,
        notifications: previous.notifications.map((item) => id === undefined || item.id === id ? { ...item, readAt: new Date().toISOString() } : item),
      } : previous);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
        body: JSON.stringify({ nickname }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      const nextUser = result.user as AccountUser;
      setUser(nextUser);
      setData((previous) => previous ? { ...previous, user: nextUser } : previous);
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      setMessage("昵称已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-slate-950">登录后查看账号中心</h1>
        <p className="mt-3 text-sm text-slate-500">登录后可以查看提交审核状态、系统通知、浏览历史和收藏。</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white">返回首页登录</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Account center</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{user.nickname || "我的账号"}</h1>
          <p className="mt-2 text-sm text-slate-500">{user.identifier} · 会员剩余 {user.membershipDays} 天</p>
        </div>
        <a href="/upload" className="inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-medium text-white hover:bg-slate-800">分享一条记录</a>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => changeTab(item.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition lg:block lg:w-full ${tab === item.key ? "bg-slate-950 font-medium text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white px-5 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.05)] sm:px-7">
          {loading ? <div className="py-16 text-center text-sm text-slate-400">正在加载...</div> : null}
          {false ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-5">
                <div><h2 className="text-lg font-semibold text-slate-950">系统通知</h2><p className="mt-1 text-xs text-slate-400">未读 {unread} 条</p></div>
                {unread > 0 ? <button type="button" onClick={() => void markRead()} className="text-sm text-slate-500 hover:text-slate-950">全部标为已读</button> : null}
              </div>
              {data.notifications.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">暂无系统通知</p> : data.notifications.map((item) => (
                <div key={item.id} className={`border-b border-slate-100 py-5 last:border-0 ${item.readAt ? "" : "bg-amber-50/40"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="flex items-center gap-2"><h3 className="text-sm font-medium text-slate-950">{item.title}</h3>{!item.readAt ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}</div><p className="mt-2 text-sm leading-6 text-slate-600">{item.content}</p></div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs">
                    {item.link ? <a href={item.link} className="text-slate-700 underline underline-offset-2">查看详情</a> : null}
                    {!item.readAt ? <button type="button" onClick={() => void markRead(item.id)} className="text-slate-400 hover:text-slate-900">标为已读</button> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!loading && data && tab === "records" ? (
            <div>
              <div className="border-b border-slate-100 py-5"><h2 className="text-lg font-semibold text-slate-950">我的提交记录</h2><p className="mt-1 text-xs text-slate-400">审核状态和审核意见会在这里保留。</p></div>
              {data.records.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">还没有提交记录</p> : data.records.map((record) => <RecordLine key={record.id} record={record} />)}
            </div>
          ) : null}

          {!loading && data && tab === "history" ? (
            <div>
              <div className="border-b border-slate-100 py-5"><h2 className="text-lg font-semibold text-slate-950">浏览历史</h2><p className="mt-1 text-xs text-slate-400">最近查看过的公司和公开记录。</p></div>
              {data.browseHistory.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">暂无浏览历史</p> : data.browseHistory.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 border-b border-slate-100 py-4 last:border-0">
                  <div>{item.company ? <a href={`/companies/${item.company.id}`} className="text-sm font-medium text-slate-950 hover:underline">公司：{item.company.name}</a> : null}{item.record ? <RecordLine record={item.record} /> : null}</div>
                  <span className="shrink-0 text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!loading && data && tab === "favorites" ? (
            <div>
              <div className="border-b border-slate-100 py-5"><h2 className="text-lg font-semibold text-slate-950">我的收藏</h2><p className="mt-1 text-xs text-slate-400">收藏公司和评价，方便之后继续比较。</p></div>
              <h3 className="pt-5 text-sm font-semibold text-slate-900">收藏的公司</h3>
              {data.favoriteCompanies.length === 0 ? <p className="py-5 text-sm text-slate-400">还没有收藏公司</p> : <div className="grid gap-3 py-4 sm:grid-cols-2">{data.favoriteCompanies.map((item) => <a key={item.id} href={`/companies/${item.company.id}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-400"><div className="font-medium text-slate-950">{item.company.name}</div><div className="mt-2 text-xs text-slate-500">{item.company.industry || "未分类"} · 可信度 {item.company.score}</div></a>)}</div>}
              <h3 className="border-t border-slate-100 pt-5 text-sm font-semibold text-slate-900">收藏的评价</h3>
              {data.favoriteRecords.length === 0 ? <p className="py-5 text-sm text-slate-400">还没有收藏评价</p> : data.favoriteRecords.map((item) => <RecordLine key={item.id} record={item.record} />)}
            </div>
          ) : null}

          {!loading && data && tab === "profile" ? (
            <div>
              <div className="border-b border-slate-100 py-5"><h2 className="text-lg font-semibold text-slate-950">账号资料</h2><p className="mt-1 text-xs text-slate-400">设置一个更容易识别的昵称。</p></div>
              <div className="max-w-md py-6">
                <label className="block text-sm font-medium text-slate-800">账号昵称<input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} placeholder="例如：Lupin" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-900" /></label>
                <p className="mt-2 text-xs text-slate-400">登录账号：{user.identifier}</p>
                <button type="button" onClick={() => void saveProfile()} disabled={saving} className="mt-5 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">{saving ? "保存中..." : "保存昵称"}</button>
                {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
              </div>
            </div>
          ) : null}
          {!loading && data && tab === "redeem" ? (
            <div>
              <div className="border-b border-slate-100 py-5"><h2 className="text-lg font-semibold text-slate-950">兑换会员</h2><p className="mt-1 text-xs text-slate-400">输入兑换码后，会员天数将立即到账。</p></div>
              <div className="max-w-md py-6"><label className="block text-sm font-medium text-slate-800">兑换码<input value={redeemCode} onChange={(event) => setRedeemCode(event.target.value.toUpperCase())} maxLength={32} placeholder="BJXXXXXXXXXX" className="mt-2 h-11 w-full border border-slate-200 px-3 font-mono text-sm uppercase outline-none focus:border-slate-900" /></label><button type="button" onClick={() => void redeem()} disabled={redeeming || !redeemCode.trim()} className="mt-4 bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{redeeming ? "兑换中..." : "立即兑换"}</button>{message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}</div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
