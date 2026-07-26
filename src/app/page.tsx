import HomePanels from "@/components/HomePanels";
import { prisma } from "@/lib/prisma";

async function getStats() {
  try {
    const [companyCount, recordCount] = await Promise.all([
      prisma.company.count(),
      prisma.record.count({ where: { status: "APPROVED" } }),
    ]);
    return { companyCount, recordCount };
  } catch {
    return { companyCount: 0, recordCount: 0 };
  }
}

export default async function Home() {
  const stats = await getStats();

  return <HomePanels companyCount={stats.companyCount} recordCount={stats.recordCount} />;
}
