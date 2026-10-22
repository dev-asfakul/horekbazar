import { getTranslations } from "next-intl/server";
import { AccountSkeleton } from "@/components/skeleton/Skeleton";

export default async function Loading() {
  const t = await getTranslations("common");
  return <AccountSkeleton label={t("loading")} />;
}
