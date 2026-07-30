import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const typeLabels: Record<string, string> = {
  JD_SNAPSHOT: "招聘信息",
  CHAT_SCREENSHOT: "HR 对话",
  INTERVIEW_EXPERIENCE: "面试经历",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId)) notFound();

  const record = await prisma.record.findFirst({
    where: { id: recordId, status: "APPROVED", isReported: false },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!record) notFound();

  let images: string[] = [];
  try {
    const parsed = JSON.parse(record.images);
    images = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    images = [];
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/companies/${record.company.id}`} className="inline-flex h-10 items-center border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950">返回公司记录</Link>
      <article className="mt-6 border-2 border-slate-900 bg-white">
        <header className="border-b-2 border-slate-900 bg-slate-950 px-5 py-6 text-white sm:px-7"><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">{typeLabels[record.type] || record.type}</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">{record.title}</h1><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300"><span>{record.company.name}</span><span>{record.position || record.actualPosition || "岗位未填写"}</span>{record.city ? <span>{record.city}</span> : null}<time>{formatDate(record.createdAt)} 发布</time></div></header>
        <div className="p-5 sm:p-7">
          {record.rating ? <div className="flex items-center gap-3 border-b border-slate-100 pb-5"><span className="text-sm font-semibold text-slate-700">综合评分</span><span className="text-xl tracking-[0.12em] text-amber-400">{"★".repeat(record.rating)}{"☆".repeat(5 - record.rating)}</span><span className="text-sm text-slate-500">{record.rating} / 5</span></div> : null}
          <section className="mt-6"><h2 className="text-base font-bold text-slate-950">记录内容</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{record.content}</p></section>
          {record.type === "JD_SNAPSHOT" ? <section className="mt-7 grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2"><div className="border border-slate-200 p-4"><p className="text-xs font-bold text-slate-500">招聘薪资</p><p className="mt-2 text-sm leading-6 text-slate-800">{record.salaryRange || "未填写"}</p><p className="mt-3 text-xs font-semibold text-slate-600">{record.isSalaryConsistent === true ? "用户确认：与实际相符" : record.isSalaryConsistent === false ? "用户确认：与实际不符" : "未核对是否相符"}</p>{record.isSalaryConsistent === false && record.actualSalary ? <p className="mt-2 border-l-2 border-red-500 pl-3 text-sm leading-6 text-red-700">实际薪资：{record.actualSalary}</p> : null}</div><div className="border border-slate-200 p-4"><p className="text-xs font-bold text-slate-500">招聘工作内容</p><p className="mt-2 text-sm leading-6 text-slate-800">{record.workContent || "详见记录原文"}</p><p className="mt-3 text-xs font-semibold text-slate-600">{record.isWorkContentConsistent === true ? "用户确认：与实际相符" : record.isWorkContentConsistent === false ? "用户确认：与实际不符" : "未核对是否相符"}</p>{record.isWorkContentConsistent === false && record.actualWorkContent ? <p className="mt-2 border-l-2 border-red-500 pl-3 text-sm leading-6 text-red-700">实际工作内容：{record.actualWorkContent}</p> : null}</div></section> : null}
          {images.length > 0 ? <section className="mt-7 border-t border-slate-200 pt-6"><h2 className="text-base font-bold text-slate-950">相关截图</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{images.map((src, index) => <a key={src} href={src} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] overflow-hidden border border-slate-200 bg-slate-100"><Image src={src} alt={`记录截图 ${index + 1}`} fill unoptimized className="object-contain" /></a>)}</div></section> : null}
        </div>
      </article>
    </main>
  );
}
