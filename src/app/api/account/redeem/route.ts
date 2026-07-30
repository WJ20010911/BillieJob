import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function userIdOf(request: NextRequest) {
  const value = Number(request.headers.get("x-user-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const userId = userIdOf(request);
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { code: input } = await request.json();
  const code = typeof input === "string" ? input.trim().toUpperCase() : "";
  if (!code) return NextResponse.json({ error: "请输入兑换码" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.redemptionCode.findUnique({ where: { code } });
      if (!item || !item.active || item.usedCount >= item.maxUses) throw new Error("兑换码无效或已用完");
      const used = await tx.redemptionUse.findUnique({ where: { codeId_userId: { codeId: item.id, userId } } });
      if (used) throw new Error("你已经兑换过这个兑换码");
      const claimed = await tx.redemptionCode.updateMany({ where: { id: item.id, active: true, usedCount: { lt: item.maxUses } }, data: { usedCount: { increment: 1 } } });
      if (claimed.count !== 1) throw new Error("兑换码已用完，请更换其他兑换码");
      await tx.redemptionUse.create({ data: { codeId: item.id, userId } });
      const user = await tx.user.update({ where: { id: userId }, data: { membershipDays: { increment: item.membershipDays } }, select: { id: true, identifier: true, nickname: true, membershipDays: true } });
      await tx.notification.create({ data: { userId, type: "REDEMPTION_REWARDED", title: "兑换会员到账", content: `兑换码已成功兑换，会员天数增加 ${item.membershipDays} 天。`, link: "/account?tab=profile" } });
      return { user, days: item.membershipDays };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "兑换失败" }, { status: 400 });
  }
}
