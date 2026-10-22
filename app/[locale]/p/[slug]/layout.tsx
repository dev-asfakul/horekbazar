// Decides "not found" before the loading skeleton streams, so an unknown product is a real 404.
import { notFound } from "next/navigation";
import { localeOf } from "@/lib/storefront/page";
import { loadStore } from "@/lib/storefront/context";
import { productBySlug } from "@/lib/storefront/lookups";

export default async function ProductLayout({ children, params }: LayoutProps<"/[locale]/p/[slug]">) {
  const { locale, slug } = await params;
  if (!localeOf(locale)) notFound();
  const store = await loadStore();
  if (store.ready && !(await productBySlug(slug))) notFound();
  return children;
}
