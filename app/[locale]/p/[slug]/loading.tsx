import { getTranslations } from "next-intl/server";
import { ProductSkeleton } from "@/components/skeleton/Skeleton";

export default async function Loading() {
  const t = await getTranslations("common");
  return <ProductSkeleton label={t("loading")} />;
}
