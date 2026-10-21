// Home route. Until the database port exists and is connected, it shows the setup-required
// state (no fallback data, DESIGN.md §1 conflict 1). The designed SetupRequired component is B1.
import type { Metadata } from "next";
import { getSetupStatus } from "@/lib/setup/status";
import { isLocale, type Locale } from "@/lib/i18n/locales";

const copy: Record<Locale, { title: string; body: string; missing: string; invalid: string; guide: string }> = {
  bn: {
    title: "সেটআপ প্রয়োজন",
    body: "এই স্টোরের ডেটাবেস এখনো সংযুক্ত হয়নি, তাই কোনো পণ্য দেখানো যাচ্ছে না।",
    missing: "যে ভেরিয়েবলগুলো সেট করা নেই:",
    invalid: "যে ভেরিয়েবলগুলোর মান সঠিক নয়:",
    guide: "সেটআপ নির্দেশিকা: প্রকল্পের README.md ফাইল।",
  },
  en: {
    title: "Setup required",
    body: "This store's database is not connected yet, so no products can be shown.",
    missing: "Variables that are not set:",
    invalid: "Variables with an invalid value:",
    guide: "Setup guide: the project's README.md file.",
  },
};

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const lang: Locale = isLocale(locale) ? locale : "bn";
  // A setup state is not public content, so it is not indexed.
  return { title: copy[lang].title, robots: { index: false, follow: false } };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const lang: Locale = isLocale(locale) ? locale : "bn";
  const t = copy[lang];
  const status = getSetupStatus(process.env);

  return (
    <main id="main" data-state="setup-required" className="mx-auto max-w-prose p-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="mt-3">{t.body}</p>
      {status.missing.length > 0 && (
        <>
          <p className="mt-4">{t.missing}</p>
          <ul className="mt-1 list-disc pl-6 font-mono">
            {status.missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </>
      )}
      {status.invalid.length > 0 && (
        <>
          <p className="mt-4">{t.invalid}</p>
          <ul className="mt-1 list-disc pl-6 font-mono">
            {status.invalid.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4">{t.guide}</p>
    </main>
  );
}
