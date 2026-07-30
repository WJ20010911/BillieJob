"use client";

import { useEffect, useRef, useState } from "react";
import LoginDialog from "@/components/LoginDialog";

interface UserInfo {
  id: number;
  identifier: string;
  nickname?: string | null;
  membershipDays: number;
}

const USER_KEY = "job_insight_user";

function loadUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user: UserInfo) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(USER_KEY);
}

export function getUser(): UserInfo | null {
  return loadUser();
}

export default function UserMenu() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; content: string; link: string | null; readAt: string | null; createdAt: string }>>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setUser(loadUser());
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/account", { headers: { "x-user-id": String(user.id) } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) {
          setUnreadCount(data.unreadCount || 0);
          setNotifications(data.notifications || []);
        }
      })
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const openNotifications = async () => {
    if (!user) return;
    setShowMenu(false);
    setShowNotifications((value) => !value);
    try {
      const response = await fetch("/api/account", { headers: { "x-user-id": String(user.id) } });
      const data = await response.json();
      if (response.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* leave the previous notification snapshot visible */ }
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    const response = await fetch("/api/account/notifications", { method: "PATCH", headers: { "Content-Type": "application/json", "x-user-id": String(user.id) }, body: JSON.stringify({ all: true }) });
    if (response.ok) {
      setUnreadCount(0);
      setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    }
  };

  const handleLogin = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setLogging(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        saveUser(data.user);
        setUser(data.user);
        setShowLogin(false);
        setIdentifier("");
      } else {
        setError(data.error || "登录失败");
      }
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLogging(false);
    }
  };

  const handleLogout = () => {
    clearUser();
    setUser(null);
    setUnreadCount(0);
    setShowMenu(false);
  };

  const maskIdentifier = (value: string) => {
    if (value.includes("@")) {
      const parts = value.split("@");
      const name = parts[0];
      const domain = parts[1];
      return name.length > 2 ? name.slice(0, 2) + "***@" + domain : name + "***@" + domain;
    }

    return value.length > 7 ? value.slice(0, 3) + "****" + value.slice(-4) : value;
  };

  return (
    <div className="relative">
      {user ? (
        <div ref={menuRef}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void openNotifications()}
              className="relative flex h-8 w-8 items-center justify-center rounded-full text-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              aria-label="系统通知"
              title="系统通知"
            >
              <span aria-hidden="true" className="text-[clamp(1rem,3.2vw,1.25rem)] leading-none">🔔</span>
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => {
                setShowNotifications(false);
                setShowMenu((value) => !value);
              }}
              className="flex items-center gap-2 text-sm text-slate-700 transition hover:text-slate-950"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {(user.nickname || user.identifier)[0].toUpperCase()}
              </span>
              <span className="hidden sm:inline">{user.nickname || maskIdentifier(user.identifier)}</span>
              <span className="text-xs font-medium text-amber-600">{user.membershipDays} 天</span>
            </button>
          </div>

          {showNotifications ? (
            <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><strong className="text-sm text-slate-900">系统通知</strong><button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0} className="text-xs font-medium text-cyan-700 disabled:text-slate-300">全部标为已读</button></div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-400">暂无通知</p> : notifications.map((item) => <a key={item.id} href={item.link || "/account?tab=profile"} className={`block border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50 ${item.readAt ? "" : "bg-cyan-50/50"}`} onClick={() => setShowNotifications(false)}><div className="flex gap-2"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-red-500"}`} /><div><p className="text-sm font-medium text-slate-900">{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.content}</p></div></div></a>)}
              </div>
            </div>
          ) : null}

          {showMenu ? (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white py-2 shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
              <div className="border-b border-slate-100 px-4 py-2">
                <div className="text-sm font-medium text-slate-900">{user.nickname || "未设置昵称"}</div>
                <div className="mt-0.5 text-xs text-slate-400">{user.identifier}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  会员剩余 <strong className="text-amber-600">{user.membershipDays}</strong> 天
                </div>
              </div>
              <a href="/account?tab=records" className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" onClick={() => setShowMenu(false)}>提交记录</a>
              <a
                href="/account?tab=profile"
                className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                onClick={() => setShowMenu(false)}
              >
                账号资料
              </a>
              <a
                href="/account?tab=history"
                className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                onClick={() => setShowMenu(false)}
              >
                浏览历史
              </a>
              <a
                href="/account?tab=favorites"
                className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                onClick={() => setShowMenu(false)}
              >
                我的收藏
              </a>
              <a href="/account?tab=redeem" className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" onClick={() => setShowMenu(false)}>兑换会员</a>
              <a
                href="/upload"
                className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                onClick={() => setShowMenu(false)}
              >
                分享经历
              </a>
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-slate-50"
              >
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          onClick={() => setShowLogin(true)}
          className="inline-flex items-center rounded-full border border-slate-200 bg-[var(--surface)] px-4 py-2 text-sm font-medium text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition hover:border-slate-300 hover:bg-white"
        >
          登录
        </button>
      )}

      <LoginDialog
        open={showLogin}
        title="登录 BillieJob"
        description="登录后可以分享经历，也能直接查看会员天数。"
        value={identifier}
        error={error}
        loading={logging}
        onChange={setIdentifier}
        onClose={() => {
          setShowLogin(false);
          setError("");
          setIdentifier("");
        }}
        onSubmit={handleLogin}
      />
    </div>
  );
}
