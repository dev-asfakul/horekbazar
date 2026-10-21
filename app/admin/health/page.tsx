// /admin/health (BUILD-PLAN B2, SCHEMA.md → admin sections #ports, #outbox, #jobs). Read-only.
// Requires platform.read (B3: real staff sessions; the B2 development-only opening is removed).
// Shows names and states only, never values.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HealthView } from "@/components/admin/HealthView";
import { gateStaffPage, getAdminLocale } from "@/lib/auth/server";
import { getHealthReport } from "@/lib/platform/health";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.health" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminHealthPage() {
  const locale = await getAdminLocale();
  await gateStaffPage("/admin/health");
  return <HealthView locale={locale} report={await getHealthReport()} />;
}
