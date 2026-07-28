import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Ma_Shan_Zheng,
} from "next/font/google";
import "./globals.css";
import UserMenu from "@/components/UserMenu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const displaySerif = Cormorant_Garamond({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const displayCn = Ma_Shan_Zheng({
  variable: "--font-display-cn",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    template: "%s | BillieJob",
    default: "BillieJob | 避雷工作",
  },
  description: "用真实用户的求职记录，反向监督企业招聘诚信。",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8fafc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={[
        geistSans.variable,
        geistMono.variable,
        displaySerif.variable,
        displayCn.variable,
        "h-full antialiased",
      ].join(" ")}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(255,253,248,0.84)] backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 overflow-x-auto px-4">
            <Link href="/" className="flex shrink-0 items-baseline gap-2 text-slate-950 transition hover:text-slate-700">
             <span className="font-[var(--font-display-serif)] text-xl font-semibold tracking-[0.08em]">
               BillieJob
             </span>
            </Link>
            <nav className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
              <Link href="/upload" className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border-2 border-slate-950 bg-white px-3 text-xs font-bold text-slate-950 shadow-[0_4px_0_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-slate-50 sm:px-4 sm:text-sm">
                分享记录
              </Link>
              <Link href="/analyze" className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border-2 border-cyan-700 bg-cyan-600 px-3 text-xs font-bold text-white shadow-[0_4px_0_rgba(8,145,178,0.2)] transition hover:-translate-y-0.5 hover:bg-cyan-700 sm:px-4 sm:text-sm">
                职位分析
              </Link>
              <UserMenu />
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--line)] bg-[color:rgba(255,253,248,0.92)] py-6">
          <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500">
            <p className="mb-2">内容来自用户个人经历，仅供判断和参考。</p>
            <div className="flex justify-center gap-4">
              <a href="/privacy" className="transition hover:text-slate-800">
                免责声明
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
