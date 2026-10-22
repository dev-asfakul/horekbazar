// Structured data block. Not executed, so the CSP does not apply; "<" is escaped so data can never
// close the script element. Callers pass only real published records (BUILD-PLAN B5: JSON-LD).
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
