import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/upload`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];

  try {
    const companies = await prisma.company.findMany({
      select: { id: true, updatedAt: true },
    });

    const companyPages: MetadataRoute.Sitemap = companies.map((c) => ({
      url: `${baseUrl}/companies/${c.id}`,
      lastModified: c.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.9,
    }));

    return [...staticPages, ...companyPages];
  } catch {
    return staticPages;
  }
}
