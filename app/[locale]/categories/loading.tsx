import { getTranslations } from "next-intl/server";
import { TilesSkeleton } from "@/components/skeleton/Skeleton";

export default async function Loading() {
  const t = await getTranslations("common");
  return <TilesSkeleton label={t("loading")} />;
}
