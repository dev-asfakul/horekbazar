"use client";
// Last-resort 500 when the locale layout itself fails. It replaces the whole document, so it cannot
// rely on the layout, messages or fonts; it is bilingual and uses the global stylesheet only.
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="bn">
      <body>
        <main id="main">
          <section className="state-page" data-state="error" aria-labelledby="state-title">
            <title>কিছু একটা সমস্যা হয়েছে | Something went wrong</title>
            <h1 id="state-title" className="state-title">
              কিছু একটা সমস্যা হয়েছে
            </h1>
            <p className="state-body">পাতাটি এখন দেখানো যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।</p>
            <p className="state-body" lang="en">
              Something went wrong. This page can&apos;t be shown right now. Please try again in a moment.
            </p>
            {error.digest ? (
              <p className="state-meta" lang="en">
                Reference: <code>{error.digest}</code>
              </p>
            ) : null}
            <p className="state-actions">
              <button type="button" className="btn btn-primary" onClick={() => retry()}>
                আবার চেষ্টা করুন / Try again
              </button>
            </p>
          </section>
        </main>
      </body>
    </html>
  );
}
