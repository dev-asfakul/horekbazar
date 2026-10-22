# Banglish-first copy: audit and proposal (for owner review; nothing changed yet)

Owner instruction, 2026-10-22: customer-facing copy in polished, natural Latin-script Banglish, with
familiar English commerce terms kept. No broad rewrite before this review.

## What exists now (audited on `e517154`)

- One copy system already exists: next-intl with `messages/bn.json` (reference catalogue) and
  `messages/en.json`, the same 735 keys in each; a unit test keeps the key sets identical. `bn` is
  served on `/`, `en` on `/en`. **Reuse this; no new framework.**
- 732 of the 735 `bn` strings are Bengali script. By area: `admin` 457, `forms` 116, `auth` 58,
  `account` 55, `shell` 25, `setup` 9, other states 15.
- Bengali text outside `messages/`: `app/global-error.tsx` (hard-coded fallback page), customer email
  templates in `lib/modules/identity/emails.ts`, the language option label in
  `app/[locale]/account/profile/page.tsx`, role names in `lib/modules/identity/roles.ts` (admin).
  `lib/modules/identity/phone.ts` and `lib/format/money.ts` handle Bengali digits; those are
  input/format logic, not copy.
- `<html lang>` is the route locale (`bn`); one Noto Sans Bengali subset is preloaded per page; the
  store setting `numerals` defaults to `bengali` (DESIGN.md, B1 Defaults).
- The unmerged commit `e517154` rewrote Bengali-script copy into a casual style. A Banglish rewrite
  would supersede it.
- Product data (names, descriptions, variant titles) is stored with `bn` in Bengali script and `en`
  in English. Rule: not rewritten without separate approval.

## Proposed conventions

- Latin letters only, no diacritics. `sh` for শ/ষ, `kh` খ, `ch` চ, `j` জ/য, `o` for the inherent
  vowel only where people actually write it (`kora`, `korun`).
- English commerce terms as-is, capitalised in navigation and buttons: Cart, Checkout, Orders,
  Wishlist, Search, Login, Account, Delivery, Payment, Email, Password, Product, Category.
- The suffix after an English word joins with a hyphen: `page-ti`, `link-ti`, `email-e`.
- Latin digits everywhere (`৳1,250`), and so set the store `numerals` setting to `latin`.
- Short buttons (1–3 words); one polite form (`apni`, `korun`) everywhere.
- Legal, payment, security and policy wording: same meaning, reviewed by the owner line by line.

## Examples (current → proposed)

| Key | Current `bn` | Proposed Banglish |
|---|---|---|
| `shell.search.placeholder` | কী খুঁজছেন? যেমন চাল, তেল, সাবান | Ki khujchen? Jemon chal, tel, saban |
| `shell.search.label` | প্রোডাক্ট সার্চ করুন | Product search korun |
| `shell.categories` / `cart` / `account` | ক্যাটাগরি / কার্ট / অ্যাকাউন্ট | Categories / Cart / Account |
| `setup.body` | এই স্টোরের সেটআপ এখনো শেষ হয়নি, তাই এখন কোনো প্রোডাক্ট দেখানো যাচ্ছে না। | Store-er setup ekhono shesh hoyni, tai ekhon kono product dekhano jacche na. |
| `notFound.title` | পেজটি পাওয়া যায়নি | Page-ti paowa jayni |
| `notFound.body` | ঠিকানাটি ভুল হতে পারে, অথবা পেজটি সরিয়ে নেওয়া হয়েছে। | Link-ti bhul hote pare, ba page-ti shoriye neya hoyeche. |
| `error.title` / `error.retry` | কিছু একটা সমস্যা হয়েছে / আবার চেষ্টা করুন | Kichu ekta shomossha hoyeche / Abar try korun |
| `offline.title` | ইন্টারনেট সংযোগ নেই | Internet connection nei |
| `auth.login.title` / `submit` | লগইন / লগইন করুন | Login / Login korun |
| `auth.login.forgot` | পাসওয়ার্ড ভুলে গেছেন? | Password bhule gechen? |
| `auth.register.title` | নতুন অ্যাকাউন্ট খুলুন | Notun account khulun |
| `forms.errors.invalid_credentials` | এই ইমেইল ও পাসওয়ার্ডে কোনো অ্যাকাউন্ট মেলেনি। | Ei email ar password diye kono account paowa jayni. |
| `forms.errors.email_not_verified` | আগে ইমেইল ভেরিফাই করুন। পাঠানো লিংকটি খুলুন, অথবা নিচ থেকে নতুন লিংক চান। | Age email verify korun. Pathano link-ti khulun, ba niche theke notun link chan. |
| `forms.fieldErrors.password_length` | ১০ থেকে ১২৮ অক্ষর ব্যবহার করুন | 10 theke 128 character din |
| `forms.errors.rate_limited` | অনেকবার চেষ্টা হয়েছে। কয়েক মিনিট পরে আবার চেষ্টা করুন। | Onekbar try kora hoyeche. Kichukkhon por abar try korun. |
| `forms.success.reset_requested` | এই ঠিকানায় অ্যাকাউন্ট থাকলে পাসওয়ার্ড রিসেটের লিংক পাঠানো হচ্ছে। লিংকটি ১ ঘণ্টা, একবারই কাজ করবে। | Ei email-e account thakle password reset link pathano hocche. Link-ti 1 ghonta, shudhu ekbar kaj korbe. |
| `account.ordersTitle` | আমার অর্ডার | Amar Orders |
| `account.ordersBody` | অর্ডার নেওয়া শুরু হলে আপনার সব অর্ডার এখানে দেখাবে। | Order neya shuru hole apnar shob order ekhane dekhabe. |
| verify-email subject | আপনার ইমেইল যাচাই করুন | Apnar email verify korun |
| reset-password subject | পাসওয়ার্ড রিসেট | Password reset korun |

## Decisions needed before the rewrite

1. **Scope.** Proposed: storefront shell and states, auth, account, form errors, customer emails,
   `global-error.tsx` (about 280 strings). Admin (457 strings): keep as is, switch to Banglish, or
   English only?
2. **Bengali script on `/`.** Replace the `bn` catalogue with Banglish (one copy source, `/en` stays
   English), or keep Bengali script as a third option?
3. **Product data.** Product names would stay in Bengali script next to Banglish UI. Show the
   existing English product names on `/` instead, add Banglish names, or leave as is?
4. **`lang` and SEO.** Proposed `lang="bn-Latn"` for Banglish pages (Latin text marked as Bengali
   script would be read wrongly by screen readers); hreflang and font preload change with it (the
   Bengali font is then needed only for Bengali product names).
5. **`e517154`.** Drop it (superseded), or merge it first?

## Guard against regressions (proposed, with the rewrite)

- Unit test: no string in the customer-facing `bn` namespaces contains U+0980–U+09FF (allow-list:
  the language switch label `বাংলা`), and the glossary terms appear in their fixed spelling.
- Same check on `lib/modules/identity/emails.ts` and `app/global-error.tsx`.
- Review checklist in this file: meaning unchanged for legal/payment/security text; button length;
  one spelling per word; checked at 375 px for wrapping.
