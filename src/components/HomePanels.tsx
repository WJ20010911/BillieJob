"use client";

import { useCallback, useEffect, useRef } from "react";
import SearchBox from "@/components/SearchBox";

export default function HomePanels({
  companyCount,
  recordCount,
}: {
  companyCount: number;
  recordCount: number;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const panelIndexRef = useRef(0);
  const lockedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  const moveToPanel = useCallback((index: number) => {
    const shell = shellRef.current;
    if (!shell) return;

    const panels = shell.querySelectorAll<HTMLElement>("[data-home-panel]");
    const target = panels[index];
    if (!target) return;

    const shellTop = shell.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top - shellTop + shell.scrollTop;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    panelIndexRef.current = index;
    lockedRef.current = true;
    const startTop = shell.scrollTop;
    const distance = targetTop - startTop;
    const startTime = performance.now();
    const duration = 680;

    const animate = (currentTime: number) => {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const eased = progress < 0.5
        ? 4 * progress ** 3
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      shell.scrollTop = startTop + distance * eased;

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      shell.scrollTop = targetTop;
      animationFrameRef.current = null;
      lockedRef.current = false;
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const handleWheel = (event: WheelEvent) => {
      if (window.innerWidth < 768 || Math.abs(event.deltaY) < 2) return;

      event.preventDefault();
      if (lockedRef.current) return;

      const direction = event.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(1, panelIndexRef.current + direction));
      if (nextIndex !== panelIndexRef.current) {
        moveToPanel(nextIndex);
      }
    };

    shell.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      shell.removeEventListener("wheel", handleWheel);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [moveToPanel]);

  return (
    <div ref={shellRef} className="home-shell">
      <section data-home-panel className="home-panel home-panel-title">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 text-center">
          <h1 className="brand-title">
            <span className="brand-title-en">BillieJob</span>
            <span className="brand-title-zh">避雷工作</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-600">
            用真实求职记录，筛掉不值得去的公司。
          </p>
          <button
            type="button"
            aria-label="滚动到搜索区"
            onClick={() => moveToPanel(1)}
            className="mt-10 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition hover:border-slate-300 hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5v14m0 0l-5-5m5 5l5-5" />
            </svg>
          </button>
        </div>
      </section>

      <section data-home-panel className="home-panel home-panel-search">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center px-6 text-center">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">搜公司</h2>
          <p className="mt-3 text-sm text-slate-500">先查口碑，再决定要不要聊。</p>
          <div className="mt-8 w-full max-w-3xl">
            <SearchBox />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500">
            <span>{companyCount} 家公司</span>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span>{recordCount} 条记录</span>
          </div>
        </div>
      </section>
    </div>
  );
}
