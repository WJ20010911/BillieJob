import Database from "better-sqlite3";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const BACKUP_PREFIX = "billiejob-backup-";
const IMPORT_PREFIX = "uploaded-backup-";

export interface BackupMetadata {
  version: 1;
  createdAt: string;
  archiveName: string;
  databaseFile: "database.sqlite";
  databaseBytes: number;
  uploadsIncluded: boolean;
  uploadFileCount: number;
  restoreInstructions: string[];
}

function appRoot() {
  return process.cwd();
}

export function backupDirectory() {
  return path.resolve(/* turbopackIgnore: true */ appRoot(), process.env.BACKUP_DIR || "backups");
}

function databaseFile() {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) throw new Error("当前数据库不是 SQLite，无法创建本地迁移备份包");
  return path.resolve(/* turbopackIgnore: true */ appRoot(), decodeURIComponent(url.slice(5)));
}

function retentionHours() {
  const value = Number(process.env.BACKUP_RETENTION_HOURS || 72);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 72;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

function isValidArchiveName(name: string) {
  return new RegExp(`^${BACKUP_PREFIX}[0-9TZ-]+\\.tar\\.gz$`, "u").test(name);
}

function isValidImportName(name: string) { return new RegExp("^" + IMPORT_PREFIX + "[0-9TZ-]+\\.tar\\.gz$", "u").test(name); }
export function importedBackupDirectory() { return path.join(backupDirectory(), "imports"); }
export interface ImportedBackup { archiveName: string; archiveBytes: number; uploadedAt: string; }
export async function validateBackupArchive(file: string) {
  const result = await execFileAsync("tar", ["-tzf", file], { maxBuffer: 8 * 1024 * 1024 });
  const entries = result.stdout.split(/\r?\n/u).map((entry) => entry.replace(/^\.\//u, "")).filter(Boolean);
  if (entries.some((entry) => path.posix.isAbsolute(entry) || entry.split("/").includes(".."))) throw new Error("备份包包含不安全的文件路径");
  if (!entries.includes("database.sqlite") || !entries.includes("backup-manifest.json")) throw new Error("这不是 BillieJob 备份包，缺少数据库或备份清单");
  return entries;
}
export async function listImportedBackups(): Promise<ImportedBackup[]> {
  const directory = importedBackupDirectory();
  try { const entries = await fs.readdir(directory, { withFileTypes: true }); const backups = await Promise.all(entries.filter((entry) => entry.isFile() && isValidImportName(entry.name)).map(async (entry) => { const stat = await fs.stat(path.join(directory, entry.name)); return { archiveName: entry.name, archiveBytes: stat.size, uploadedAt: stat.mtime.toISOString() }; })); return backups.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)); }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function saveImportedBackup(bytes: Uint8Array): Promise<ImportedBackup> {
  if (!bytes.byteLength) throw new Error("上传的备份包为空"); if (bytes.byteLength > 250 * 1024 * 1024) throw new Error("备份包不能超过 250 MB");
  const directory = importedBackupDirectory(); await fs.mkdir(directory, { recursive: true }); const archiveName = IMPORT_PREFIX + timestamp() + ".tar.gz"; const destination = path.join(directory, archiveName); await fs.writeFile(destination, bytes);
  try { await validateBackupArchive(destination); return { archiveName, archiveBytes: bytes.byteLength, uploadedAt: new Date().toISOString() }; } catch (error) { await fs.rm(destination, { force: true }); throw error; }
}
export async function importedBackupFilePath(name: string) { if (!isValidImportName(name)) return null; const file = path.join(importedBackupDirectory(), name); try { await fs.access(file); return file; } catch { return null; } }

async function countFiles(directory: string): Promise<number> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const counts = await Promise.all(entries.map((entry) => entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : entry.isFile() ? 1 : 0));
    return counts.reduce((total, count) => total + count, 0);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

async function removeExpiredBackups() {
  const directory = backupDirectory();
  const expiresBefore = Date.now() - retentionHours() * 60 * 60 * 1000;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile() && (entry.name.endsWith(".tar.gz") || entry.name.endsWith(".json"))).map(async (entry) => {
    const item = path.join(directory, entry.name);
    const stat = await fs.stat(item);
    if (stat.mtimeMs < expiresBefore) await fs.rm(item, { force: true });
  }));
}

export async function listBackups(): Promise<BackupMetadata[]> {
  const directory = backupDirectory();
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const backups = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => {
      try {
        const metadata = JSON.parse(await fs.readFile(path.join(directory, entry.name), "utf8")) as BackupMetadata;
        if (!metadata || metadata.version !== 1 || !isValidArchiveName(metadata.archiveName)) return null;
        const archive = path.join(directory, metadata.archiveName);
        const stat = await fs.stat(archive);
        return { ...metadata, archiveBytes: stat.size };
      } catch {
        return null;
      }
    }));
    return backups.filter((item): item is BackupMetadata & { archiveBytes: number } => Boolean(item)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function backupFilePath(name: string) {
  if (!isValidArchiveName(name)) return null;
  const file = path.join(backupDirectory(), name);
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

export async function createBackup(): Promise<BackupMetadata & { archiveBytes: number }> {
  const directory = backupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, ".backup.lock");
  let lock: fs.FileHandle | null = null;
  try {
    lock = await fs.open(lockPath, "wx");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("已有备份任务正在运行，请稍后再试");
    throw error;
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(directory, ".creating-"));
  try {
    const snapshotPath = path.join(temporaryDirectory, "database.sqlite");
    const database = new Database(databaseFile(), { readonly: true });
    try {
      await database.backup(snapshotPath);
    } finally {
      database.close();
    }

    const uploadsSource = path.join(appRoot(), "public", "uploads");
    const uploadFileCount = await countFiles(uploadsSource);
    if (uploadFileCount > 0) await fs.cp(uploadsSource, path.join(temporaryDirectory, "uploads"), { recursive: true });
    const archiveName = `${BACKUP_PREFIX}${timestamp()}.tar.gz`;
    const databaseStat = await fs.stat(snapshotPath);
    const metadata: BackupMetadata = {
      version: 1,
      createdAt: new Date().toISOString(),
      archiveName,
      databaseFile: "database.sqlite",
      databaseBytes: databaseStat.size,
      uploadsIncluded: uploadFileCount > 0,
      uploadFileCount,
      restoreInstructions: ["停止新服务器上的 BillieJob 服务。", "解压备份包，将 database.sqlite 覆盖到项目根目录的 dev.db（或 DATABASE_URL 指向的 SQLite 文件）。", "将 uploads 目录内容复制到 public/uploads。", "确认 .env.local 的密钥配置后，执行 prisma generate、构建并重启服务。"],
    };
    await fs.writeFile(path.join(temporaryDirectory, "backup-manifest.json"), JSON.stringify(metadata, null, 2));
    const archivePath = path.join(directory, archiveName);
    await execFileAsync("tar", ["-czf", archivePath, "-C", temporaryDirectory, "."]);
    await fs.writeFile(path.join(directory, archiveName.replace(/\.tar\.gz$/u, ".json")), JSON.stringify(metadata, null, 2));
    await removeExpiredBackups();
    const archiveStat = await fs.stat(archivePath);
    return { ...metadata, archiveBytes: archiveStat.size };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    await lock?.close();
    await fs.rm(lockPath, { force: true });
  }
}
