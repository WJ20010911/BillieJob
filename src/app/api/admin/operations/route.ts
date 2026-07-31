import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "admin_session";
const SESSION_TOKEN = "admin-logged-in";
const authorized = (request: NextRequest) => request.cookies.get(SESSION_COOKIE)?.value === SESSION_TOKEN;
const codeValue = () => `BJ${crypto.randomUUID().replace(/-/gu, "").slice(0, 10).toUpperCase()}`;

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || "users";
  const query = searchParams.get("q")?.trim() || "";
  if (kind === "users") {
    const users = await prisma.user.findMany({ where: query ? { OR: [{ identifier: { contains: query } }, { nickname: { contains: query } }] } : undefined, orderBy: { createdAt: "desc" }, take: 200, include: { _count: { select: { records: true, redemptionUses: true } } } });
    return NextResponse.json({ users });
  }
  if (kind === "companies") {
    const companies = await prisma.company.findMany({ where: { records: { some: {} }, ...(query ? { name: { contains: query } } : {}) }, orderBy: { updatedAt: "desc" }, take: 100, include: { records: { orderBy: { updatedAt: "desc" }, take: 80, select: { id: true, title: true, type: true, status: true, position: true, city: true, content: true, updatedAt: true } }, _count: { select: { records: true } } } });
    return NextResponse.json({ companies });
  }
  if (kind === "codes") {
    const codes = await prisma.redemptionCode.findMany({
      where: query ? { code: { contains: query.toUpperCase() } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        uses: { orderBy: { createdAt: "desc" }, select: { createdAt: true, user: { select: { identifier: true, nickname: true } } } },
        _count: { select: { uses: true } },
      },
    });
    return NextResponse.json({ codes });
  }
  if (kind === "ads") {
    const ads = await prisma.advertisement.findMany({ where: query ? { title: { contains: query } } : undefined, orderBy: { updatedAt: "desc" }, take: 100, include: { _count: { select: { unlocks: true } } } });
    return NextResponse.json({ ads });
  }
  return NextResponse.json({ error: "无效请求" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await request.json();
  if (body.action === "createAd") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
    if (!title) return NextResponse.json({ error: "广告标题不能为空" }, { status: 400 });
    const ad = await prisma.advertisement.create({ data: { title, description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : "", imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim().slice(0, 500) : "", targetUrl: typeof body.targetUrl === "string" ? body.targetUrl.trim().slice(0, 500) : "", enabled: body.enabled !== false, startAt: body.startAt ? new Date(body.startAt) : null, endAt: body.endAt ? new Date(body.endAt) : null } });
    return NextResponse.json({ success: true, ad });
  }
  if (body.action !== "createCodes") return NextResponse.json({ error: "无效操作" }, { status: 400 });
  const quantity = Math.max(1, Math.min(200, Number(body.quantity) || 1));
  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 30) return NextResponse.json({ error: "会员天数需为 1-30 天" }, { status: 400 });
  const maxUses = Math.max(1, Math.min(1000, Number(body.maxUses) || 1));
  const codes = await prisma.$transaction(Array.from({ length: quantity }, () => prisma.redemptionCode.create({ data: { code: codeValue(), membershipDays: days, maxUses } })));
  return NextResponse.json({ success: true, codes });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await request.json();
  if (body.action === "giftMembership") {
    const userId = Number(body.userId);
    const days = Number(body.days);
    if (!Number.isInteger(userId) || !Number.isInteger(days) || days < 1 || days > 30) return NextResponse.json({ error: "会员天数需为 1-30 天" }, { status: 400 });
    const user = await prisma.user.update({ where: { id: userId }, data: { membershipDays: { increment: days } }, select: { id: true, identifier: true, nickname: true, membershipDays: true } });
    await prisma.notification.create({ data: { userId, type: "ADMIN_MEMBERSHIP_GIFT", title: "会员天数到账", content: `平台赠送 ${days} 天会员，感谢你的关注与支持。`, link: "/account?tab=profile" } });
    return NextResponse.json({ success: true, user });
  }
  if (body.action === "updateRecord") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "记录参数无效" }, { status: 400 });
    const record = await prisma.record.update({ where: { id }, data: { title: typeof body.title === "string" ? body.title.trim().slice(0, 120) : undefined, position: typeof body.position === "string" ? body.position.trim().slice(0, 80) : undefined, content: typeof body.content === "string" ? body.content.trim().slice(0, 5000) : undefined }, select: { id: true, title: true, position: true, content: true } });
    return NextResponse.json({ success: true, record });
  }
  if (body.action === "deleteRecord") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "记录参数无效" }, { status: 400 });
    await prisma.record.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }
  if (body.action === "setCodeActive") {
    const id = Number(body.id);
    const active = Boolean(body.active);
    await prisma.redemptionCode.update({ where: { id }, data: { active } });
    return NextResponse.json({ success: true });
  }
  if (body.action === "updateAd") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "广告参数无效" }, { status: 400 });
    const ad = await prisma.advertisement.update({ where: { id }, data: { title: typeof body.title === "string" ? body.title.trim().slice(0, 120) : undefined, description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : undefined, imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim().slice(0, 500) : undefined, targetUrl: typeof body.targetUrl === "string" ? body.targetUrl.trim().slice(0, 500) : undefined, enabled: typeof body.enabled === "boolean" ? body.enabled : undefined, startAt: body.startAt ? new Date(body.startAt) : body.startAt === null ? null : undefined, endAt: body.endAt ? new Date(body.endAt) : body.endAt === null ? null : undefined } });
    return NextResponse.json({ success: true, ad });
  }
  if (body.action === "deleteAd") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "广告参数无效" }, { status: 400 });
    await prisma.advertisement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "无效操作" }, { status: 400 });
}
