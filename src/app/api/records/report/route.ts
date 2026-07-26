import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { recordId, reason } = await request.json();

    if (!recordId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const record = await prisma.record.update({
      where: { id: recordId },
      data: {
        isReported: true,
        reportCount: { increment: 1 },
        reportReason: reason || "用户举报",
      },
    });

    // Auto-reject if reported 3+ times
    if (record.reportCount >= 3 && record.status === "APPROVED") {
      await prisma.record.update({
        where: { id: recordId },
        data: { status: "REJECTED" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json({ error: "举报失败" }, { status: 500 });
  }
}
