// /admin: admin home (Proposal A1, docs/ADMIN-REDESIGN-A1.md §4). Any verified staff role.
// No owner yet → the setup page; signed out → /login; 2FA pending → /admin/security (gateStaffPage).
// "Work waiting" shows real, capped counts only for sections this role can open; each card loads on
// its own (Suspense) and shows "Couldn't load" on a database error, never a made-up 0.
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { Db } from "mongodb";
import { Icon } from "@/components/ui/Icon";
import { groupSections, sectionsFor } from "@/lib/admin/sections";
import { countWork, formatWorkCount, WORK_COUNTS, type WorkCountDef, type WorkCountKey } from "@/lib/admin/work-counts";
import { gateStaffPage, getAdminLocale, getIdentity } from "@/lib/auth/server";
import { decideAccess } from "@/lib/modules/identity/principal";
import { ownerExists } from "@/lib/modules/identity/staff";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({
    locale: await getAdminLocale(),
    namespace: "admin.home",
  });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const LABEL_KEY: Record<WorkCountKey, "countOrders" | "countMessages" | "countReturns" | "countLowStock"> = {
  orders: "countOrders",
  messages: "countMessages",
  returns: "countReturns",
  lowStock: "countLowStock",
};

async function WorkCard({ db, def, label, errorLabel }: { db: Db; def: WorkCountDef; label: string; errorLabel: string }) {
  let n: number | null = null;
  try {
    n = await countWork(db, def);
  } catch {
    n = null;
  }
  if (n === null) {
    return (
      <Link href={def.href} className="work-card" data-state="error" data-testid={`work-${def.key}`}>
        <span className="work-count">{errorLabel}</span>
        <span className="work-label">{label}</span>
      </Link>
    );
  }
  return (
    <Link href={def.href} className="work-card" data-state="ready" data-waiting={n > 0 ? "" : undefined} data-testid={`work-${def.key}`}>
      <span className="work-count">{formatWorkCount(n)}</span>
      <span className="work-label">{label}</span>
    </Link>
  );
}

function WorkCardLoading({ label, loading }: { label: string; loading: string }) {
  return (
    <div className="work-card" data-state="loading" aria-busy="true">
      <span className="work-count">{loading}</span>
      <span className="work-label">{label}</span>
    </div>
  );
}

export default async function AdminHomePage() {
  const locale = await getAdminLocale();
  const identity = await getIdentity();
  if (!identity.ok || !(await ownerExists(identity.identity.db))) redirect("/admin/setup");
  const db = identity.identity.db;
  const principal = await gateStaffPage("/admin");
  const t = await getTranslations({ locale, namespace: "admin" });
  const caps = principal.role!.capabilities;
  const counts = WORK_COUNTS.filter((d) => decideAccess(principal, d.capability).result === "allowed");
  const canCreateProduct = decideAccess(principal, "catalogue.write").result === "allowed";
  const canFindCustomer = decideAccess(principal, "customers.read").result === "allowed";
  const groups = groupSections(sectionsFor(caps)).map(({ group, sections }) => ({
    group,
    label: t(`nav.groups.${group}`),
    tiles: sections.map((s) => ({
      href: s.href,
      icon: s.icon,
      label: t(`nav.${s.key}`),
      desc: t(`home.${s.key}Desc`),
    })),
  }));
  return (
    <div className="admin-page" data-testid="admin-home">
      <h1 className="font-display admin-title">{t("home.title")}</h1>
      <p className="admin-meta">
        {t("home.signedInAs", {
          email: principal.user.email,
          role: principal.role!.name[locale] ?? principal.role!.name.bn,
        })}
      </p>

      {counts.length > 0 ? (
        <section className="admin-section" aria-labelledby="work-title">
          <h2 id="work-title" className="admin-section-title">
            {t("home.work")}
          </h2>
          <ul className="work-cards">
            {counts.map((def) => (
              <li key={def.key}>
                <Suspense fallback={<WorkCardLoading label={t(`home.${LABEL_KEY[def.key]}`)} loading={t("home.workLoading")} />}>
                  <WorkCard db={db} def={def} label={t(`home.${LABEL_KEY[def.key]}`)} errorLabel={t("home.workError")} />
                </Suspense>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canCreateProduct || canFindCustomer ? (
        <section className="admin-section" aria-labelledby="quick-title">
          <h2 id="quick-title" className="admin-section-title">
            {t("home.quick")}
          </h2>
          <div className="quick-actions">
            {canCreateProduct ? (
              <Link href="/admin/products/new" className="btn btn-primary">
                <Icon name="plus" size={18} />
                {t("home.newProduct")}
              </Link>
            ) : null}
            {canFindCustomer ? (
              <form className="quick-find" role="search" action="/admin/customers" method="get" aria-label={t("home.findCustomer")}>
                <div className="field">
                  <label className="field-label" htmlFor="quick-find-customer">
                    {t("home.findCustomer")}
                  </label>
                  <input id="quick-find-customer" name="q" type="search" className="field-input" placeholder={t("home.findCustomerPlaceholder")} autoComplete="off" />
                </div>
                <button type="submit" className="btn btn-secondary">
                  <Icon name="search" size={18} />
                  {t("home.findCustomerSubmit")}
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="admin-section" aria-labelledby="sections-title">
        <h2 id="sections-title" className="admin-section-title">
          {t("home.sections")}
        </h2>
        {groups.map((g) => (
          <div key={g.group} className="admin-group">
            <h3 className="admin-group-title" id={`home-group-${g.group}`}>
              {g.label}
            </h3>
            <ul className="admin-tiles" aria-labelledby={`home-group-${g.group}`}>
              {g.tiles.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="admin-tile">
                    <span className="admin-tile-icon" aria-hidden="true">
                      <Icon name={s.icon} size={20} />
                    </span>
                    <span className="admin-tile-text">
                      <span className="admin-tile-name">{s.label}</span>
                      <span className="admin-tile-desc">{s.desc}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
