// ESLint flat config: Next.js core-web-vitals + TypeScript rules, plus project guards.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // R14 / D11: the generated draft catalogue is never read by application code.
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["scripts/validate-catalogue-schema.mjs"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/catalogue/**", "catalogue/**"], message: "catalogue/ is an unapproved draft (D11) and must never be imported by application code." }] },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "catalogue/**", ".agents/**", ".claude/**"],
  },
];

export default config;
