import type { Prisma } from "@prisma/client";
import SearchBox from "@/components/SearchBox";
import MaskedCompanyName from "@/components/MaskedCompanyName";
import { prisma } from "@/lib/prisma";

type SearchCompany = {
  id: number;
  name: string;
  alias: string | null;
  industry: string | null;
  score: number;
  recordCount: number;
  cities: string[];
  matchedPositions: string[];
};

function mapCompanies(
  companies: Array<{
    id: number;
    name: string;
    alias: string | null;
    industry: string | null;
    score: number;
    records: Array<{ city: string; position: string }>;
    _count: { records: number };
  }>,
  query: string,
): SearchCompany[] {
  const normalizedQuery = query.toLocaleLowerCase();

  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    alias: company.alias,
    industry: company.industry,
    score: company.score,
    recordCount: company._count.records,
    cities: [
      ...new Set(company.records.map((record) => record.city).filter(Boolean)),
    ],
    matchedPositions: [
      ...new Set(
        company.records
          .map((record) => record.position.trim())
          .filter(
            (position) =>
              position &&
              position.toLocaleLowerCase().includes(normalizedQuery),
          ),
      ),
    ].slice(0, 8),
  }));
}

function companySearchWhere(
  query: string,
  city?: string,
): Prisma.CompanyWhereInput {
  const keywordMatch: Prisma.CompanyWhereInput = {
    OR: [
      { name: { contains: query } },
      { alias: { contains: query } },
      {
        records: {
          some: {
            status: "APPROVED",
            position: { contains: query },
            ...(city ? { city } : {}),
          },
        },
      },
    ],
  };

  if (!city) return keywordMatch;

  return {
    AND: [
      keywordMatch,
      { records: { some: { status: "APPROVED", city } } },
    ],
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string }>;
}) {
  const { q, city } = await searchParams;
  const query = q?.trim() || "";
  const cityFilter = city?.trim() || "";

  let companies: SearchCompany[] = [];
  let noResultsInCity = false;

  if (query) {
    try {
      const where = companySearchWhere(query, cityFilter);

      const results = await prisma.company.findMany({
        where,
        select: {
          id: true,
          name: true,
          alias: true,
          industry: true,
          score: true,
          records: {
            where: { status: "APPROVED" },
            select: { city: true, position: true },
          },
          _count: {
            select: { records: { where: { status: "APPROVED" } } },
          },
        },
        orderBy: [{ score: "desc" }, { name: "asc" }],
      });

      companies = mapCompanies(results, query);

      if (cityFilter && companies.length === 0) {
        noResultsInCity = true;
        const fallback = await prisma.company.findMany({
          where: {
            ...companySearchWhere(query),
          },
          select: {
            id: true,
            name: true,
            alias: true,
            industry: true,
            score: true,
            records: {
              where: { status: "APPROVED" },
              select: { city: true, position: true },
            },
            _count: {
              select: { records: { where: { status: "APPROVED" } } },
            },
          },
          orderBy: [{ score: "desc" }, { name: "asc" }],
        });
        companies = mapCompanies(fallback, query);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <SearchBox />
      </div>

      {query ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            搜索公司或岗位：“{query}”
            {cityFilter ? <span className="ml-2 text-sm font-normal text-gray-400">{cityFilter}</span> : null}
          </h2>

          {noResultsInCity ? (
            <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              <strong>{cityFilter} 暂无匹配的公司或岗位</strong>
              <p className="mt-1">以下展示其他城市的相关结果。</p>
            </div>
          ) : null}

          {companies.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-gray-500">未找到相关公司或岗位</p>
              <p className="mb-6 text-sm text-gray-400">
                你可以
                <a href="/upload" className="mx-1 text-blue-600 hover:underline">
                  上传这家公司的记录
                </a>
                成为第一个分享者
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => (
                <a
                  key={company.id}
                  href={"/companies/" + company.id + (cityFilter ? "?city=" + encodeURIComponent(cityFilter) : "")}
                  className="block rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900"><MaskedCompanyName name={company.name} /></div>
                      <div className="mt-0.5 text-sm text-gray-500">
                        {company.alias ? company.alias + " · " : ""}
                        {company.industry || "未分类"}
                      </div>
                      {company.matchedPositions.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {company.matchedPositions.slice(0, 4).map((position) => (
                            <span
                              key={position}
                              className="border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800"
                            >
                              {position}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {company.cities.length > 0 ? (
                        <div className="mt-1 text-xs text-gray-400">
                          {company.cities.slice(0, 4).join(" · ")}
                          {company.cities.length > 4 ? " · · ·" : ""}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">{company.score}</div>
                      <div className="text-xs text-gray-400">{company.recordCount} 条记录</div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
