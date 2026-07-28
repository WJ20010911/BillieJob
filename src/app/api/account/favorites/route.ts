import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type FavoriteKind = "company" | "record";

function getUserId(request: NextRequest) {
  const value = Number(request.headers.get("x-user-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseInput(body: { kind?: unknown; id?: unknown }) {
  const kind = body.kind === "company" || body.kind === "record" ? body.kind : null;
  const id = Number(body.id);
  return { kind, id: Number.isInteger(id) && id > 0 ? id : null } as { kind: FavoriteKind | null; id: number | null };
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = Number(searchParams.get("id"));
  if ((kind !== "company" && kind !== "record") || !Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "收藏参数无效" }, { status: 400 });
  }

  const favorite = kind === "company"
    ? await prisma.favoriteCompany.findUnique({ where: { userId_companyId: { userId, companyId: id } } })
    : await prisma.favoriteRecord.findUnique({ where: { userId_recordId: { userId, recordId: id } } });
  return NextResponse.json({ favorited: Boolean(favorite) });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const { kind, id } = parseInput(await request.json());
    if (!kind || !id) return NextResponse.json({ error: "收藏参数无效" }, { status: 400 });

    if (kind === "company") {
      await prisma.favoriteCompany.upsert({
        where: { userId_companyId: { userId, companyId: id } },
        create: { userId, companyId: id },
        update: {},
      });
    } else {
      await prisma.favoriteRecord.upsert({
        where: { userId_recordId: { userId, recordId: id } },
        create: { userId, recordId: id },
        update: {},
      });
    }
    return NextResponse.json({ success: true, favorited: true });
  } catch (error) {
    console.error("Add favorite error:", error);
    return NextResponse.json({ error: "收藏失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const { kind, id } = parseInput(await request.json());
    if (!kind || !id) return NextResponse.json({ error: "收藏参数无效" }, { status: 400 });
    if (kind === "company") {
      await prisma.favoriteCompany.deleteMany({ where: { userId, companyId: id } });
    } else {
      await prisma.favoriteRecord.deleteMany({ where: { userId, recordId: id } });
    }
    return NextResponse.json({ success: true, favorited: false });
  } catch (error) {
    console.error("Remove favorite error:", error);
    return NextResponse.json({ error: "取消收藏失败" }, { status: 500 });
  }
}
