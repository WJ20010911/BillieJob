import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VISITOR_COOKIE = "bj_ad_visitor";

function visitorFor(request: NextRequest) {
  const userId = Number(request.headers.get("x-user-id"));
  if (Number.isInteger(userId) && userId > 0) return { key: `user:${userId}`, userId };
  return { key: request.cookies.get(VISITOR_COOKIE)?.value || crypto.randomUUID(), userId: null };
}

function activeWhere(now: Date) {
  return { placement: "RECORD_PAGE", enabled: true, OR: [{ startAt: null }, { startAt: { lte: now } }], AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }] };
}

export async function GET(request: NextRequest) {
  const companyId = Number(new URL(request.url).searchParams.get("companyId"));
  if (!Number.isInteger(companyId) || companyId < 1) return NextResponse.json({ error: "公司参数无效" }, { status: 400 });
  const visitor = visitorFor(request);
  const now = new Date();
  const existing = await prisma.adUnlock.findFirst({ where: { companyId, visitorKey: visitor.key, expiresAt: { gt: now } } });
  const ad = await prisma.advertisement.findFirst({ where: activeWhere(now), orderBy: { updatedAt: "desc" }, select: { id: true, title: true, description: true, imageUrl: true, targetUrl: true } });
  if (ad) await prisma.advertisement.update({ where: { id: ad.id }, data: { impressionCount: { increment: 1 } } });
  const response = NextResponse.json({ ad, unlocked: Boolean(existing) });
  if (!request.cookies.get(VISITOR_COOKIE) && visitor.userId === null) response.cookies.set(VISITOR_COOKIE, visitor.key, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return response;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const companyId = Number(body.companyId);
  const adId = Number(body.adId);
  if (!Number.isInteger(companyId) || !Number.isInteger(adId) || companyId < 1 || adId < 1) return NextResponse.json({ error: "广告参数无效" }, { status: 400 });
  const visitor = visitorFor(request);
  const now = new Date();
  const ad = await prisma.advertisement.findFirst({ where: { id: adId, ...activeWhere(now) }, select: { id: true } });
  if (!ad) return NextResponse.json({ error: "广告已下线或已过期" }, { status: 400 });
  const existing = await prisma.adUnlock.findFirst({ where: { adId, companyId, visitorKey: visitor.key, expiresAt: { gt: now } } });
  if (existing) return NextResponse.json({ success: true, unlocked: true, expiresAt: existing.expiresAt });
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.adUnlock.create({ data: { adId, companyId, visitorKey: visitor.key, userId: visitor.userId, expiresAt } }),
    prisma.advertisement.update({ where: { id: adId }, data: { completionCount: { increment: 1 } } }),
  ]);
  const response = NextResponse.json({ success: true, unlocked: true, expiresAt });
  if (!request.cookies.get(VISITOR_COOKIE) && visitor.userId === null) response.cookies.set(VISITOR_COOKIE, visitor.key, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return response;
}
