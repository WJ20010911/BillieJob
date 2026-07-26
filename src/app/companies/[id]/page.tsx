import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { parseCompanyExternalProfile } from "@/lib/company-profile";
import type { RecordData } from "@/types";
import CompanyPageClient from "./client";

async function getCompany(id: number) {
  try {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            records: { where: { status: "APPROVED" } },
          },
        },
      },
    });

    if (!company) return null;

    const cities = await prisma.record.findMany({
      where: { companyId: id, status: "APPROVED", city: { not: "" } },
      select: { city: true },
      distinct: ["city"],
    });

    return {
      id: company.id,
      name: company.name,
      alias: company.alias,
      description: company.description,
      industry: company.industry,
      businessInfo: company.businessInfo,
      score: company.score,
      riskTags: JSON.parse(company.riskTags) as string[],
      recordCount: company._count.records,
      cities: cities.map((item) => item.city),
      createdAt: company.createdAt.toISOString(),
      externalProfile: parseCompanyExternalProfile(company.businessInfo),
    };
  } catch {
    return null;
  }
}

async function getCompanyRecords(companyId: number): Promise<RecordData[]> {
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

    return records.map((record) => ({
      ...record,
      type: record.type as RecordData["type"],
      status: record.status as RecordData["status"],
      images: JSON.parse(record.images),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      uploaderId: record.userId ? String(record.userId) : null,
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (Number.isNaN(companyId)) return { title: "公司未找到" };

  const company = await getCompany(companyId);
  if (!company) return { title: "公司未找到" };

  return {
    title: company.name + " | BillieJob",
    description:
      company.description ||
      "查看 " + company.name + " 的用户记录、外部风险数据和可信度评分。",
  };
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ city?: string }>;
}) {
  const { id } = await params;
  const { city } = await searchParams;
  const companyId = parseInt(id, 10);

  if (Number.isNaN(companyId)) notFound();

  const [company, initialRecords] = await Promise.all([
    getCompany(companyId),
    getCompanyRecords(companyId),
  ]);

  if (!company) notFound();

  return (
    <CompanyPageClient
      company={company}
      initialCity={city || ""}
      initialRecords={initialRecords}
    />
  );
}
