// /admin (interim section index until the B7 orders dashboard replaces it). Any verified staff role.
// No owner yet → the setup page; signed out → /login; 2FA pending → /admin/security (gateStaffPage).
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sectionsFor } from "@/lib/admin/sections";
import { gateStaffPage, getAdminLocale, getIdentity } from "@/lib/auth/server";
import { ownerExists } from "@/lib/modules/identity/staff";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.home" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminHomePage() {
  const locale = await getAdminLocale();
  const identity = await getIdentity();
  if (!identity.ok || !(await ownerExists(identity.identity.db))) redirect("/admin/setup");
  const principal = await gateStaffPage("/admin");
  const t = await getTranslations({ locale, namespace: "admin" });
  const caps = principal.role!.capabilities;
  const sections = sectionsFor(caps).map((s) => ({ href: s.href, label: t(`nav.${s.key}`), desc: t(`home.${s.key}Desc`) }));
  return (
    <div className="admin-page" data-testid="admin-home">
      <h1 className="font-display admin-title">{t("home.title")}</h1>
      <p className="admin-meta">{t("home.signedInAs", { email: principal.user.email, role: principal.role!.name[locale] ?? principal.role!.name.bn })}</p>
      <p className="admin-intro">{t("home.intro")}</p>
      <section className="admin-section" aria-labelledby="sections-title">
        <h2 id="sections-title" className="admin-section-title">
          {t("home.sections")}
        </h2>
        <ul className="admin-index">
          {sections.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="admin-index-link">
                {s.label}
              </Link>
              <p className="field-hint">{s.desc}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
