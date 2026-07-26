"use client";

import { useEffect, useRef, useState } from "react";
import LoginDialog from "@/components/LoginDialog";

interface UserInfo {
  id: number;
  identifier: string;
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
  const [user, setUser] = useState<UserInfo | null>(() => loadUser());
  const [showLogin, setShowLogin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

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
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 text-sm text-slate-700 transition hover:text-slate-950"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {user.identifier[0].toUpperCase()}
            </span>
            <span className="hidden sm:inline">{maskIdentifier(user.identifier)}</span>
            <span className="text-xs font-medium text-amber-600">{user.membershipDays} 天</span>
          </button>

          {showMenu ? (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white py-2 shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
              <div className="border-b border-slate-100 px-4 py-2">
                <div className="text-sm font-medium text-slate-900">{user.identifier}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  会员剩余 <strong className="text-amber-600">{user.membershipDays}</strong> 天
                </div>
              </div>
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
