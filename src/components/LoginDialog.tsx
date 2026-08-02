"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

interface LoginDialogProps {
  open: boolean;
  title: string;
  description?: string;
  value: string;
  error?: string;
  loading?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

interface OAuthUser {
  id: number;
  identifier: string;
  nickname?: string | null;
  membershipDays: number;
}

type OAuthStatus = { qq: boolean; wechat: boolean };

const USER_KEY = "job_insight_user";

export default function LoginDialog({
  open,
  title,
  description,
  value,
  error,
  loading = false,
  onChange,
  onClose,
  onSubmit,
}: LoginDialogProps) {
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus | null>(null);
  const [oauthError, setOAuthError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/auth/oauth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: OAuthStatus) => {
        if (active) setOAuthStatus(data);
      })
      .catch(() => {
        if (active) setOAuthStatus({ qq: false, wechat: false });
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "billiejob-oauth") return;
      if (event.data.error) {
        setOAuthError(String(event.data.error));
        return;
      }
      const user = event.data.user as OAuthUser | undefined;
      if (!user?.id) return;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      window.location.reload();
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [open]);

  const openOAuth = (provider: "qq" | "wechat") => {
    setOAuthError("");
    const popup = window.open(
      `/api/auth/oauth/${provider}/start`,
      "billiejob-oauth",
      "popup=yes,width=720,height=760,resizable=yes,scrollbars=yes",
    );
    if (!popup) setOAuthError("浏览器阻止了登录窗口，请允许弹出窗口后重试");
  };

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[24px] border border-white/60 bg-white/96 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.22)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <Image
                src="/billiejob-logo.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
              <span>BillieJob</span>
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h2>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => openOAuth("qq")}
              disabled={!oauthStatus?.qq}
              title={oauthStatus?.qq === false ? "QQ 登录尚未配置" : "QQ 扫码登录"}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 text-sm font-medium text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white">QQ</span>
              QQ 扫码登录
            </button>
            <button
              type="button"
              onClick={() => openOAuth("wechat")}
              disabled={!oauthStatus?.wechat}
              title={oauthStatus?.wechat === false ? "微信登录尚未配置" : "微信扫码登录"}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">微</span>
              微信扫码登录
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>或使用账号</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              手机号或邮箱
            </label>
            <input
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="输入手机号或邮箱"
              onKeyDown={(event) => event.key === "Enter" && onSubmit()}
              className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:bg-white"
              autoFocus
            />
            <p className="mt-2 text-xs leading-5 text-slate-400">
              首次输入会自动注册，暂时无需密码。
            </p>
          </div>

          {error || oauthError ? (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {oauthError || error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || !value.trim()}
            className="h-13 w-full rounded-2xl bg-slate-950 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "登录中..." : "继续"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
