import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Simple session token via cookie
const SESSION_COOKIE = "admin_session";
const SESSION_TOKEN = "admin-logged-in";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { username },
    });

    if (!admin || admin.passwordHash !== password) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, SESSION_TOKEN, {
      httpOnly: true,
      secure: false, // dev only
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "登录失败" }, { status: 500 });
  }
}
