// Tier: build. Use-when: category, product and collection pages. Breadcrumb trail plus BreadcrumbList
// JSON-LD with absolute URLs. The last item is the current page (aria-current, not a link).
import Link from "next/link";
import { JsonLd } from "@/components/store/JsonLd";

export interface Crumb {
  name: string;
  href: string;
  lang?: string;
}

export function Breadcrumbs({ items, label, origin }: { items: Crumb[]; label: string; origin: string }) {
  return (
    <>
      <nav aria-label={label} className="crumbs">
        <ol>
          {items.map((c, i) => (
            <li key={c.href}>
              {i === items.length - 1 ? (
                <span aria-current="page" lang={c.lang}>
                  {c.name}
                </span>
              ) : (
                <Link href={c.href} lang={c.lang}>
                  {c.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.href}` })),
        }}
      />
    </>
  );
}
