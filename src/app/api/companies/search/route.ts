import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function mapCompanies(
  companies: Array<{
    id: number;
    name: string;
    alias: string | null;
    industry: string | null;
    score: number;
    records: Array<{ city: string }>; 
    _count: { records: number };
  }>
) {
  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    alias: company.alias,
    industry: company.industry,
    score: company.score,
    recordCount: company._count.records,
    cities: company.records.map((record) => record.city).filter(Boolean),
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const city = searchParams.get("city")?.trim() || "";

  if (q.length < 1) return NextResponse.json({ companies: [] });

  try {
    const companyWhere: Prisma.CompanyWhereInput = {
      OR: [{ name: { contains: q } }, { alias: { contains: q } }],
    };

    if (city) {
      companyWhere.records = {
        some: { status: "APPROVED", city },
      };
    }

    const companies = await prisma.company.findMany({
      where: companyWhere,
      select: {
        id: true,
        name: true,
        alias: true,
        industry: true,
        score: true,
        records: {
          where: { status: "APPROVED" },
          select: { city: true },
          distinct: ["city"],
        },
        _count: {
          select: { records: { where: { status: "APPROVED" } } },
        },
      },
      orderBy: [{ score: "desc" }, { name: "asc" }],
      take: 20,
    });

    const result = mapCompanies(companies);

    if (city && result.length === 0) {
      const fallback = await prisma.company.findMany({
        where: {
          OR: [{ name: { contains: q } }, { alias: { contains: q } }],
        },
        select: {
          id: true,
          name: true,
          alias: true,
          industry: true,
          score: true,
          records: {
            where: { status: "APPROVED" },
            select: { city: true },
            distinct: ["city"],
          },
          _count: {
            select: { records: { where: { status: "APPROVED" } } },
          },
        },
        orderBy: [{ score: "desc" }, { name: "asc" }],
        take: 20,
      });

      return NextResponse.json({
        companies: mapCompanies(fallback),
        fallbackCity: city,
        noResultsInCity: true,
      });
    }

    return NextResponse.json({ companies: result });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "搜索失败，请稍后重试" }, { status: 500 });
  }
}
