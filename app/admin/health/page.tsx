// /admin/health (BUILD-PLAN B2, SCHEMA.md → admin sections #ports, #outbox, #jobs). Read-only:
// retrying dead letters is an action that arrives with the audit UI and staff identity.
// Requires platform.read (lib/platform/access.ts). Shows names and states only, never values.
import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HealthView } from "@/components/admin/HealthView";
import { adminLocale } from "@/lib/i18n/admin";
import { checkStaffAccess } from "@/lib/platform/access";
import { getHealthReport } from "@/lib/platform/health";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: adminLocale(), namespace: "admin.health" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminHealthPage() {
  const access = checkStaffAccess("platform.read");
  if (!access.allowed) forbidden();
  const report = await getHealthReport();
  return <HealthView locale={adminLocale()} report={report} developmentOpen={access.via === "development_server"} />;
}
