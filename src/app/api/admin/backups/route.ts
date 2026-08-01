import { createReadStream } from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { backupFilePath, createBackup, listBackups } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "admin_session";
const SESSION_TOKEN = "admin-logged-in";
const authorized = (request: NextRequest) => request.cookies.get(SESSION_COOKIE)?.value === SESSION_TOKEN;

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const name = new URL(request.url).searchParams.get("download");
  if (!name) return NextResponse.json({ backups: await listBackups(), retentionHours: Number(process.env.BACKUP_RETENTION_HOURS || 72) });
  const file = await backupFilePath(name);
  if (!file) return NextResponse.json({ error: "备份文件不存在" }, { status: 404 });
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new NextResponse(stream, { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename=\"${name}\"`, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const backup = await createBackup();
    return NextResponse.json({ success: true, backup });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建备份失败" }, { status: 500 });
  }
}
