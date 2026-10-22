// Decides "not found" before the loading skeleton streams, so an unknown category is a real 404.
import { notFound } from "next/navigation";
import { resolveCategoryPath } from "@/lib/modules/storefront/catalogue";
import { localeOf } from "@/lib/storefront/page";
import { loadStore } from "@/lib/storefront/context";

export default async function CategoryLayout({ children, params }: LayoutProps<"/[locale]/c/[...slug]">) {
  const { locale, slug } = await params;
  if (!localeOf(locale)) notFound();
  const store = await loadStore();
  if (store.ready && !resolveCategoryPath(store.tree, slug)) notFound();
  return children;
}
