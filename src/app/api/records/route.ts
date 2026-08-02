import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const allowedRecordTypes = new Set(["JD_SNAPSHOT", "CHAT_SCREENSHOT", "INTERVIEW_EXPERIENCE", "WORK_TRIAL"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, companyName, city, position, title, content, images, rating, actualPosition, salaryRange, workContent, isConsistentWithJD, isSalaryConsistent, actualSalary, isWorkContentConsistent, actualWorkContent, userId } = body;

    // Validate required fields
    if (!type || !companyName || !city || !position || !title || !content) {
      return NextResponse.json(
        { error: "请填写必要字段（类型、公司名称、城市、岗位、标题、内容）" },
        { status: 400 }
      );
    }

    if (!allowedRecordTypes.has(type)) {
      return NextResponse.json({ error: "不支持的记录类型" }, { status: 400 });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "请选择 1-5 星评分" }, { status: 400 });
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
        rating,
        city: city || "",
        position: position.trim().slice(0, 80),
        actualPosition: actualPosition || null,
        salaryRange: salaryRange || null,
        workContent: workContent || null,
        isConsistentWithJD: isConsistentWithJD !== undefined ? isConsistentWithJD : null,
        isSalaryConsistent: isSalaryConsistent !== undefined ? isSalaryConsistent : null,
        actualSalary: actualSalary || null,
        isWorkContentConsistent: isWorkContentConsistent !== undefined ? isWorkContentConsistent : null,
        actualWorkContent: actualWorkContent || null,
        status: "PENDING",
        userId: userId ? parseInt(userId) : null,
      },
    });

    if (record.userId) {
      await prisma.notification.create({
        data: {
          userId: record.userId,
          type: "RECORD_SUBMITTED",
          title: "记录已提交",
          content: "你的记录已进入审核队列，审核通过后会展示给其他求职者。",
          link: "/account?tab=records",
        },
      });
    }

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
