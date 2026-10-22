// Decides "not found" before the loading skeleton streams, so an unknown collection is a real 404.
import { notFound } from "next/navigation";
import { localeOf } from "@/lib/storefront/page";
import { loadStore } from "@/lib/storefront/context";
import { collectionBySlug } from "@/lib/storefront/lookups";

export default async function CollectionLayout({ children, params }: LayoutProps<"/[locale]/collections/[slug]">) {
  const { locale, slug } = await params;
  if (!localeOf(locale)) notFound();
  const store = await loadStore();
  if (store.ready && !(await collectionBySlug(slug))) notFound();
  return children;
}
