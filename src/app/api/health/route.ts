import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Test database connection
    const companyCount = await prisma.company.count();
    const recordCount = await prisma.record.count();
    
    return NextResponse.json({
      status: "ok",
      stats: {
        companies: companyCount,
        records: recordCount,
        adminUsers: await prisma.adminUser.count(),
      },
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { status: "error", message: String(error) },
      { status: 500 }
    );
  }
}
