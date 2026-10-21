"use client";
// 500 within a locale: the page failed but the shell still works. No error details are shown,
// only the digest as a reference the store can look up in the server logs.
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { StatePage } from "@/components/states/StatePage";

export default function LocaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("error");
  useEffect(() => {
    document.title = t("title");
  }, [t]);
  return (
    <StatePage state="error" title={t("title")}>
      <p className="state-body">{t("body")}</p>
      {error.digest ? (
        <p className="state-meta">
          {t("reference")} <code lang="en">{error.digest}</code>
        </p>
      ) : null}
      <p className="state-actions">
        <Button variant="primary" onClick={() => retry()}>
          {t("retry")}
        </Button>
      </p>
    </StatePage>
  );
}
