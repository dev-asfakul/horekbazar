// The 500 boundaries cannot be triggered in the browser suite in B1 without adding a failing
// route to the app, so their markup is checked here.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import LocaleError from "@/app/[locale]/error";
import GlobalError from "@/app/global-error";
import bn from "@/messages/bn.json";
import en from "@/messages/en.json";

const boom = Object.assign(new Error("database password is hunter2"), { digest: "1234567890" });

describe("error boundaries", () => {
  it("[locale]/error shows the localised message and the digest, never the error text", () => {
    for (const [locale, messages, title] of [
      ["bn", bn, "Kichu ekta shomossha hoyeche"],
      ["en", en, "Something went wrong"],
    ] as const) {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={{ error: messages.error }} timeZone="Asia/Dhaka">
          <LocaleError error={boom} retry={() => {}} />
        </NextIntlClientProvider>,
      );
      expect(html).toContain(title);
      expect(html).toContain("1234567890");
      expect(html).not.toContain("hunter2");
      expect(html).not.toMatch(/\sstyle=/);
    }
  });

  it("global-error is bilingual and never shows the error text", () => {
    const html = renderToStaticMarkup(<GlobalError error={boom} retry={() => {}} />);
    expect(html).toContain("Kichu ekta shomossha hoyeche");
    expect(html).toContain("Something went wrong");
    expect(html).not.toContain("hunter2");
    expect(html).not.toMatch(/\sstyle=/);
  });
});
