import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getUserId(request: NextRequest) {
  const value = Number(request.headers.get("x-user-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function PATCH(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const body = await request.json();
    if (body.all === true) {
      await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    } else {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "通知参数无效" }, { status: 400 });
      await prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    }
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
    return NextResponse.json({ success: true, unreadCount });
  } catch (error) {
    console.error("Notification update error:", error);
    return NextResponse.json({ error: "更新通知失败" }, { status: 500 });
  }
}
