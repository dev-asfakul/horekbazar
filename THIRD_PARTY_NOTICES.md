# Third-party notices (DRAFT, not reviewed)

Generated on 2026-10-23 from the installed production dependency tree (`npm ls --omit=dev --all`, 127 packages, Linux x64 install; platform-specific optional packages differ on other systems). Licence names come from each package's `package.json`. **This is an inventory for the legal review in docs/LICENSING.md, not the final notices file**: the final file must also carry each copyright line and the NOTICE text of Apache-2.0 packages, and must be regenerated from the release lockfile.

## Needs legal review

docs/LICENSING.md asks for permissive licences only and no bundled copyleft. These packages carry other licences. None of them is in the browser bundle.

| Package | Licence | How it is used | Question for review |
|---|---|---|---|
| `@img/sharp-libvips-linux-x64` | LGPL-3.0-or-later | prebuilt libvips binary loaded by `sharp` (Next.js image optimisation); it ends up in the standalone server output | LGPL obligations (licence text, source offer, allowing relinking) when the template is distributed with `node_modules`, or whether buyers should install it themselves |
| `lightningcss`, `lightningcss-linux-x64-gnu` | MPL-2.0 | CSS compiler used by Tailwind at build time | file-level copyleft only if these files are modified and distributed; confirm that unmodified build-time use is fine |
| `caniuse-lite` | CC-BY-4.0 | browser-support data used at build time | attribution wording |

## Inventory

| Package | Version | Licence | Repository |
|---|---|---|---|
| `@better-auth/core` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `@better-auth/drizzle-adapter` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `@better-auth/kysely-adapter` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `@better-auth/memory-adapter` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `@better-auth/mongo-adapter` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `@better-auth/prisma-adapter` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `@better-auth/telemetry` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `@better-auth/utils` | 0.5.0 | MIT | https://github.com/better-auth/utils |
| `@better-fetch/fetch` | 1.3.2 | MIT | https://github.com/better-auth/better-fetch |
| `@block65/webcrypto-web-push` | 2.0.0 | MIT | https://github.com/block65/webcrypto-web-push |
| `@eloqnt/config` | 0.1.1 | MIT | https://cli.eloqnt.dev/docs/configuration |
| `@eloqnt/format-json` | 0.1.0 | MIT | https://cli.eloqnt.dev/docs/configuration |
| `@eloqnt/format-po` | 0.1.1 | MIT | https://cli.eloqnt.dev/docs/formats/po |
| `@formatjs/fast-memoize` | 3.1.7 | MIT | formatjs/formatjs |
| `@formatjs/icu-messageformat-parser` | 3.5.18 | MIT | https://github.com/formatjs/formatjs |
| `@formatjs/icu-messageformat-parser` | 3.5.22 | MIT | https://github.com/formatjs/formatjs |
| `@formatjs/icu-skeleton-parser` | 2.1.11 | MIT | https://github.com/formatjs/formatjs |
| `@formatjs/icu-skeleton-parser` | 2.1.12 | MIT | https://github.com/formatjs/formatjs |
| `@formatjs/intl-localematcher` | 0.8.14 | MIT | formatjs/formatjs |
| `@img/colour` | 1.1.0 | MIT | https://github.com/lovell/colour |
| `@img/sharp-libvips-linux-x64` | 1.3.4 | LGPL-3.0-or-later **(review)** | https://github.com/lovell/sharp-libvips |
| `@img/sharp-linux-x64` | 0.35.5 | Apache-2.0 | https://github.com/lovell/sharp |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT | https://github.com/jridgewell/resolve-uri |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | https://github.com/jridgewell/sourcemaps |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | https://github.com/jridgewell/sourcemaps |
| `@mongodb-js/saslprep` | 1.6.1 | MIT | https://github.com/mongodb-js/devtools-shared |
| `@next/env` | 16.4.2 | MIT | https://github.com/vercel/next.js |
| `@next/swc-linux-x64-gnu` | 16.4.2 | MIT | https://github.com/vercel/next.js |
| `@noble/ciphers` | 2.4.0 | MIT | https://github.com/paulmillr/noble-ciphers |
| `@noble/hashes` | 2.4.0 | MIT | https://github.com/paulmillr/noble-hashes |
| `@oxc-project/types` | 0.154.0 | MIT | https://github.com/oxc-project/oxc |
| `@parcel/watcher` | 2.6.0 | MIT | https://github.com/parcel-bundler/watcher |
| `@parcel/watcher-linux-x64-glibc` | 2.6.0 | MIT | https://github.com/parcel-bundler/watcher |
| `@playwright/test` | 1.64.1 | Apache-2.0 | https://github.com/microsoft/playwright |
| `@rolldown/binding-linux-x64-gnu` | 1.2.14 | MIT | https://github.com/rolldown/rolldown |
| `@rolldown/pluginutils` | 1.0.1 | MIT | https://github.com/rolldown/plugins |
| `@schummar/icu-type-parser` | 1.21.5 | MIT | schummar/schummar-translate |
| `@standard-schema/spec` | 1.1.0 | MIT | https://github.com/standard-schema/standard-schema |
| `@swc/core` | 1.16.18 | Apache-2.0 | https://github.com/swc-project/swc |
| `@swc/core-linux-x64-gnu` | 1.16.18 | Apache-2.0 AND MIT | https://github.com/swc-project/swc |
| `@swc/counter` | 0.1.3 | Apache-2.0 | https://github.com/swc-project/pkgs |
| `@swc/helpers` | 0.5.23 | Apache-2.0 | https://github.com/swc-project/swc |
| `@swc/types` | 0.1.28 | Apache-2.0 | https://github.com/swc-project/swc |
| `@types/chai` | 5.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/deep-eql` | 4.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/estree` | 1.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/node` | 24.19.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/react` | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/webidl-conversions` | 7.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/whatwg-url` | 13.0.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@upstash/core-analytics` | v0.0.10 | MIT | https://github.com/upstash/core-analytics#readme |
| `@upstash/ratelimit` | 2.2.0 | MIT | https://github.com/upstash/ratelimit-js |
| `@upstash/redis` | 1.39.0 | MIT | git@github.com:upstash/redis-js |
| `@vitest/mocker` | 5.0.5 | MIT | https://github.com/vitest-dev/vitest |
| `@vitest/spy` | 5.0.5 | MIT | https://github.com/vitest-dev/vitest |
| `assertion-error` | 2.0.1 | MIT | git@github.com:chaijs/assertion-error |
| `baseline-browser-mapping` | 2.11.30 | Apache-2.0 | https://github.com/web-platform-dx/baseline-browser-mapping |
| `better-auth` | 1.7.12 | MIT | https://github.com/better-auth/better-auth |
| `better-call` | 1.4.4 | MIT | https://github.com/better-auth/better-call |
| `bson` | 7.3.3 | Apache-2.0 | mongodb/js-bson |
| `caniuse-lite` | 1.0.30001817 | CC-BY-4.0 **(review)** | browserslist/caniuse-lite |
| `chai` | 6.3.0 | MIT | https://github.com/chaijs/chai |
| `client-only` | 0.0.1 | MIT | https://reactjs.org/ |
| `content-type` | 2.1.0 | MIT | jshttp/content-type |
| `csstype` | 3.2.3 | MIT | https://github.com/frenic/csstype |
| `defu` | 6.1.7 | MIT | unjs/defu |
| `detect-libc` | 2.1.2 | Apache-2.0 | git://github.com/lovell/detect-libc |
| `es-module-lexer` | 2.3.2 | MIT | https://github.com/guybedford/es-module-lexer |
| `estree-walker` | 3.0.3 | MIT | https://github.com/Rich-Harris/estree-walker |
| `expect-type` | 1.4.0 | Apache-2.0 | https://github.com/mmkal/expect-type |
| `fdir` | 6.5.0 | MIT | https://github.com/thecodrr/fdir |
| `icu-minify` | 4.14.9 | MIT | https://github.com/amannn/next-intl |
| `intl-messageformat` | 11.2.15 | BSD-3-Clause | git@github.com:formatjs/formatjs |
| `is-extglob` | 2.1.1 | MIT | jonschlinkert/is-extglob |
| `is-glob` | 4.0.3 | MIT | micromatch/is-glob |
| `jiti` | 2.7.0 | MIT | unjs/jiti |
| `jose` | 6.2.13 | MIT | panva/jose |
| `kysely` | 0.29.7 | MIT | https://github.com/kysely-org/kysely |
| `lightningcss` | 1.33.0 | MPL-2.0 **(review)** | https://github.com/parcel-bundler/lightningcss |
| `lightningcss-linux-x64-gnu` | 1.33.0 | MPL-2.0 **(review)** | https://github.com/parcel-bundler/lightningcss |
| `magic-string` | 1.4.3 | MIT | https://github.com/Rich-Harris/magic-string |
| `memory-pager` | 1.5.0 | MIT | https://github.com/mafintosh/memory-pager |
| `mongodb` | 7.7.0 | Apache-2.0 | git@github.com:mongodb/node-mongodb-native |
| `mongodb-connection-string-url` | 7.0.2 | Apache-2.0 | https://github.com/mongodb-js/mongodb-connection-string-url |
| `nanoid` | 3.3.20 | MIT | ai/nanoid |
| `nanostores` | 1.5.5 | MIT | nanostores/nanostores |
| `negotiator` | 1.1.0 | MIT | jshttp/negotiator |
| `next` | 16.4.2 | MIT | vercel/next.js |
| `next-intl` | 4.14.9 | MIT | https://github.com/amannn/next-intl |
| `next-intl-swc-plugin-extractor` | 4.14.9 | MIT | https://github.com/amannn/next-intl |
| `node-addon-api` | 7.1.1 | MIT | git://github.com/nodejs/node-addon-api |
| `obug` | 3.0.0 | MIT | https://github.com/sxzz/obug |
| `picocolors` | 1.1.1 | ISC | alexeyraspopov/picocolors |
| `picomatch` | 4.0.7 | MIT | micromatch/picomatch |
| `playwright` | 1.64.1 | Apache-2.0 | https://github.com/microsoft/playwright |
| `playwright-core` | 1.64.1 | Apache-2.0 | https://github.com/microsoft/playwright |
| `po-parser` | 2.2.0 | MIT | git@github.com:amannn/po-parser |
| `postcss` | 8.5.23 | MIT | postcss/postcss |
| `postcss` | 8.5.31 | MIT | postcss/postcss |
| `punycode` | 2.3.1 | MIT | https://github.com/mathiasbynens/punycode.js |
| `react` | 19.3.1 | MIT | https://github.com/react/react |
| `react-dom` | 19.3.1 | MIT | https://github.com/react/react |
| `rolldown` | 1.2.14 | MIT | https://github.com/rolldown/rolldown |
| `rou3` | 0.9.2 | MIT | h3js/rou3 |
| `scheduler` | 0.28.0 | MIT | https://github.com/react/react |
| `semver` | 7.8.5 | ISC | https://github.com/npm/node-semver |
| `set-cookie-parser` | 3.2.1 | MIT | nfriedly/set-cookie-parser |
| `sharp` | 0.35.5 | Apache-2.0 | https://github.com/lovell/sharp |
| `source-map-js` | 1.2.2 | BSD-3-Clause | 7rulnik/source-map-js |
| `sparse-bitfield` | 3.0.3 | MIT | https://github.com/mafintosh/sparse-bitfield |
| `std-env` | 4.3.0 | MIT | unjs/std-env |
| `styled-jsx` | 5.1.6 | MIT | vercel/styled-jsx |
| `tinybench` | 6.2.2 | MIT | tinylibs/tinybench |
| `tinyexec` | 1.3.1 | MIT | https://github.com/tinylibs/tinyexec |
| `tinyglobby` | 0.2.17 | MIT | https://github.com/SuperchupuDev/tinyglobby |
| `tr46` | 5.1.1 | MIT | https://github.com/jsdom/tr46 |
| `tslib` | 2.8.1 | 0BSD | https://github.com/Microsoft/tslib |
| `uint8array-extras` | 1.6.0 | MIT | sindresorhus/uint8array-extras |
| `uncrypto` | 0.1.3 | MIT | unjs/uncrypto |
| `undici-types` | 7.24.6 | MIT | https://github.com/nodejs/undici |
| `use-intl` | 4.14.9 | MIT | https://github.com/amannn/next-intl |
| `vite` | 8.3.5 | MIT | https://github.com/vitejs/vite |
| `vitest` | 5.0.5 | MIT | https://github.com/vitest-dev/vitest |
| `webidl-conversions` | 7.0.0 | BSD-2-Clause | jsdom/webidl-conversions |
| `whatwg-url` | 14.2.0 | MIT | jsdom/whatwg-url |
| `why-is-node-running` | 3.2.1 | MIT | https://github.com/mafintosh/why-is-node-running |
| `zod` | 4.6.7 | MIT | https://github.com/colinhacks/zod |

## Fonts added by the storefront redesign (2026-10, branch `feat/redesign-night-bazaar`)

| Font | Files | Licence | Source |
|---|---|---|---|
| Google Sans (text face) | `public/fonts/v1/google-sans-{bengali,latin,latin-ext}.woff2` | SIL Open Font License 1.1, `public/fonts/OFL-GoogleSans.txt` | https://github.com/googlefonts/googlesans |
| Alkatra (display face) | `public/fonts/v1/alkatra-{bengali,latin,latin-ext}.woff2` | SIL Open Font License 1.1, `public/fonts/OFL-Alkatra.txt` | https://github.com/suman51284/Alkatra |

"Google Sans" is the font's name only; HorekBazar is not affiliated with or endorsed by Google, and the store must not suggest it is. The faces are served under the local family names "HB Google Sans" and "HB Alkatra". **(review)**

## Other material

- Fonts: SIL OFL 1.1, see `MEDIA.md` and `public/fonts/OFL-*.txt`.
- Location data (D12): not chosen yet, so nothing is listed.
- Development-only tools (ESLint, Playwright, Vitest, mongodb-memory-server, the Motomation skill, k6) are not shipped and are not listed here.
