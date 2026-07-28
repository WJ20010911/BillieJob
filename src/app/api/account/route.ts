import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getUserId(request: NextRequest) {
  const value = Number(request.headers.get("x-user-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function serializeRecord(record: { images: string; [key: string]: unknown }) {
  return { ...record, images: JSON.parse(record.images) };
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const [user, notifications, unreadCount, records, favoriteCompanies, favoriteRecords, browseHistory] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, identifier: true, nickname: true, membershipDays: true },
        }),
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.notification.count({ where: { userId, readAt: null } }),
        prisma.record.findMany({
          where: { userId },
          include: { company: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.favoriteCompany.findMany({
          where: { userId },
          include: { company: { select: { id: true, name: true, alias: true, industry: true, score: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.favoriteRecord.findMany({
          where: { userId },
          include: {
            record: {
              include: { company: { select: { id: true, name: true } } },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.browseHistory.findMany({
          where: { userId },
          include: {
            company: { select: { id: true, name: true } },
            record: { include: { company: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    return NextResponse.json({
      user,
      notifications,
      unreadCount,
      records: records.map(serializeRecord),
      favoriteCompanies,
      favoriteRecords: favoriteRecords.map((item) => ({ ...item, record: serializeRecord(item.record) })),
      browseHistory: browseHistory.map((item) => ({
        ...item,
        record: item.record ? serializeRecord(item.record) : null,
      })),
    });
  } catch (error) {
    console.error("Account overview error:", error);
    return NextResponse.json({ error: "获取账户信息失败" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const body = await request.json();
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (nickname.length > 30) return NextResponse.json({ error: "昵称不能超过 30 个字符" }, { status: 400 });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { nickname: nickname || null },
      select: { id: true, identifier: true, nickname: true, membershipDays: true },
    });
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "保存昵称失败" }, { status: 500 });
  }
}
