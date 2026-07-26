import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, companyName, city, title, content, images, actualPosition, salaryRange, workContent, isConsistentWithJD, userId } = body;

    // Validate required fields
    if (!type || !companyName || !city || !title || !content) {
      return NextResponse.json(
        { error: "请填写必要字段（类型、公司名称、城市、标题、内容）" },
        { status: 400 }
      );
    }

    // Find or create company
    let company = await prisma.company.findFirst({
      where: {
        OR: [
          { name: { equals: companyName } },
          { alias: { equals: companyName } },
        ],
      },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: companyName,
          score: 50,
        },
      });
    }

    // Create record (linked to user if logged in)
    const record = await prisma.record.create({
      data: {
        type,
        companyId: company.id,
        title,
        content,
        images: JSON.stringify(images || []),
        city: city || "",
        actualPosition: actualPosition || null,
        salaryRange: salaryRange || null,
        workContent: workContent || null,
        isConsistentWithJD: isConsistentWithJD !== undefined ? isConsistentWithJD : null,
        status: "PENDING",
        userId: userId ? parseInt(userId) : null,
      },
    });

    return NextResponse.json({
      success: true,
      recordId: record.id,
      message: "记录已提交，待审核通过后即可展示 — 通过后获得 1 天会员",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "提交失败，请稍后重试" },
      { status: 500 }
    );
  }
}
