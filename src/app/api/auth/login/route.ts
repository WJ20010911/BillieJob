import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { identifier } = await request.json();

    if (!identifier || typeof identifier !== "string") {
      return NextResponse.json({ error: "请输入手机号或邮箱" }, { status: 400 });
    }

    const trimmed = identifier.trim();
    if (trimmed.length < 2) {
      return NextResponse.json({ error: "请输入有效的手机号或邮箱" }, { status: 400 });
    }

    // Find existing user or create new one
    let user = await prisma.user.findUnique({ where: { identifier: trimmed } });

    if (!user) {
      user = await prisma.user.create({
        data: { identifier: trimmed },
      });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        identifier: user.identifier,
        membershipDays: user.membershipDays,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "登录失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");

  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      identifier: user.identifier,
      membershipDays: user.membershipDays,
    });
  } catch {
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
}
