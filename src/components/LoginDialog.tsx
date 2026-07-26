"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

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
            <p className="text-[11px] uppercase tracking-[0.32em] text-slate-400">
              BillieJob
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

          {error ? (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
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
