import { getTranslations } from "next-intl/server";
import { ListingSkeleton } from "@/components/skeleton/Skeleton";

export default async function Loading() {
  const t = await getTranslations("common");
  return <ListingSkeleton label={t("loading")} />;
}
