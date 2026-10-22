import { getTranslations } from "next-intl/server";
import { HomeSkeleton } from "@/components/skeleton/Skeleton";

export default async function Loading() {
  const t = await getTranslations("common");
  return <HomeSkeleton label={t("loading")} />;
}
