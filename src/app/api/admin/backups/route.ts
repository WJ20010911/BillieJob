import { createReadStream } from "fs";
import { spawn } from "child_process";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { backupFilePath, createBackup, importedBackupFilePath, listBackups, listImportedBackups, saveImportedBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "admin_session";
const SESSION_TOKEN = "admin-logged-in";
const authorized = (request: NextRequest) => request.cookies.get(SESSION_COOKIE)?.value === SESSION_TOKEN;

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const name = new URL(request.url).searchParams.get("download");
  if (!name) return NextResponse.json({ backups: await listBackups(), importedBackups: await listImportedBackups(), retentionHours: Number(process.env.BACKUP_RETENTION_HOURS || 72) });
  const file = await backupFilePath(name);
  if (!file) return NextResponse.json({ error: "备份文件不存在" }, { status: 404 });
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new NextResponse(stream, { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename=\"${name}\"`, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData(); const file = form.get("backup");
      if (form.get("action") !== "upload") return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
      if (!(file instanceof File) || !file.name.endsWith(".tar.gz")) return NextResponse.json({ error: "请选择 .tar.gz 格式的备份包" }, { status: 400 });
      return NextResponse.json({ success: true, backup: await saveImportedBackup(new Uint8Array(await file.arrayBuffer())) });
    }
    const body = await request.json().catch(() => ({})) as { action?: string; archiveName?: string };
    if (body.action === "restore") {
      const file = await importedBackupFilePath(body.archiveName || "");
      if (!file) return NextResponse.json({ error: "待恢复备份包不存在" }, { status: 404 });
      const child = spawn("bash", [path.join(process.cwd(), "scripts", "restore-backup.sh"), file], { detached: true, stdio: "ignore" });
      child.unref();
      return NextResponse.json({ success: true, message: "已开始恢复。系统会先备份当前数据，随后短暂重启服务。" });
    }
    const backup = await createBackup();
    return NextResponse.json({ success: true, backup });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建备份失败" }, { status: 500 });
  }
}
