#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"; ARCHIVE="$1"; IMPORT_DIR="$APP_ROOT/backups/imports"; STATUS="$APP_ROOT/backups/restore-status.json"; STAGING=""
write_status() { mkdir -p "$APP_ROOT/backups"; printf '{"updatedAt":"%s","status":"%s","message":"%s"}\n' "$(date -u +%FT%TZ)" "$1" "$2" > "$STATUS"; }
cleanup() { [ -n "$STAGING" ] && rm -rf "$STAGING"; }; trap cleanup EXIT
case "$ARCHIVE" in "$IMPORT_DIR"/uploaded-backup-*.tar.gz) ;; *) exit 1 ;; esac; [ -f "$ARCHIVE" ] || exit 1
write_status "running" "正在为恢复操作创建当前数据保护备份"; cd "$APP_ROOT"; npm run backup; STAGING="$(mktemp -d)"; tar -xzf "$ARCHIVE" -C "$STAGING"; [ -f "$STAGING/database.sqlite" ] || { write_status "failed" "备份包内缺少数据库"; exit 1; }
write_status "running" "正在替换数据库与附件，服务将短暂重启"; pm2 stop billiejob; cp "$STAGING/database.sqlite" "$APP_ROOT/dev.db"; if [ -d "$STAGING/uploads" ]; then mkdir -p "$APP_ROOT/public/uploads"; cp -a "$STAGING/uploads/." "$APP_ROOT/public/uploads/"; fi; pm2 restart billiejob; write_status "completed" "恢复完成，服务已重新启动"
