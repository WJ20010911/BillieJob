import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "admin_session";
const SESSION_TOKEN = "admin-logged-in";

function checkAuth(request: NextRequest): boolean {
  return request.cookies.get(SESSION_COOKIE)?.value === SESSION_TOKEN;
}

// List pending records
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "PENDING";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 20;

  try {
    const [records, total] = await Promise.all([
      prisma.record.findMany({
        where: { status },
        include: {
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.record.count({ where: { status } }),
    ]);

    return NextResponse.json({
      records: records.map((r) => ({
        ...r,
        images: JSON.parse(r.images),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Failed to fetch records:", error);
    return NextResponse.json({ error: "获取记录失败" }, { status: 500 });
  }
}

// Update record status (approve/reject)
export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { id, status, rejectReason } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "无效的状态" }, { status: 400 });
    }

    const record = await prisma.record.update({
      where: { id },
      data: {
        status,
        rejectReason: status === "REJECTED" ? (rejectReason || "内容不符合平台规范") : null,
      },
    });

    // When approving a record, update company score
    if (status === "APPROVED") {
      const companyRecords = await prisma.record.findMany({
        where: {
          companyId: record.companyId,
          status: "APPROVED",
        },
        select: {
          isConsistentWithJD: true,
          type: true,
        },
      });

      // Simple scoring: start at 50, adjust based on records
      let score = 50;
      const totalRecords = companyRecords.length;

      if (totalRecords > 0) {
        // Positive records increase score, negative decrease
        const consistentCount = companyRecords.filter(
          (r) => r.isConsistentWithJD === true
        ).length;
        const inconsistentCount = companyRecords.filter(
          (r) => r.isConsistentWithJD === false
        ).length;

        score = Math.round(50 + (consistentCount - inconsistentCount) * 10);
        score = Math.max(0, Math.min(100, score));
      }

      await prisma.company.update({
        where: { id: record.companyId },
        data: { score },
      });

      // Grant 1 day membership to the uploader
      if (record.userId) {
        await prisma.user.update({
          where: { id: record.userId },
          data: { membershipDays: { increment: 1 } },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update record:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
