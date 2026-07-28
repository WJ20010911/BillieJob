import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getUserId(request: NextRequest) {
  const value = Number(request.headers.get("x-user-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const history = await prisma.browseHistory.findMany({
    where: { userId },
    include: { company: true, record: { include: { company: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ history });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const body = await request.json();
    const companyId = body.companyId ? Number(body.companyId) : null;
    const recordId = body.recordId ? Number(body.recordId) : null;
    if ((companyId && recordId) || (!companyId && !recordId)) {
      return NextResponse.json({ error: "历史记录参数无效" }, { status: 400 });
    }

    if (companyId) {
      await prisma.browseHistory.deleteMany({ where: { userId, companyId, recordId: null } });
    } else if (recordId) {
      await prisma.browseHistory.deleteMany({ where: { userId, recordId, companyId: null } });
    }
    const item = await prisma.browseHistory.create({ data: { userId, companyId, recordId } });
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("Browse history error:", error);
    return NextResponse.json({ error: "保存浏览历史失败" }, { status: 500 });
  }
}
