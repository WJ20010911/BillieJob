import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const companyId = parseInt(id, 10);

  if (isNaN(companyId)) {
    return NextResponse.json({ error: "无效的公司 ID" }, { status: 400 });
  }

  try {
    const records = await prisma.record.findMany({
      where: {
        companyId,
        status: "APPROVED",
        isReported: false,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      records: records.map((r) => ({
        ...r,
        images: JSON.parse(r.images),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch records:", error);
    return NextResponse.json(
      { error: "获取记录失败" },
      { status: 500 }
    );
  }
}
