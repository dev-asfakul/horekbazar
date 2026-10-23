// k6 load-test script for the BUILD-PLAN §12 plan. NOT RUN: it needs a staging deployment equal to
// production (D5), its own replica set and an owner-approved budget. Never point it at production,
// at horekbazar-preview.vercel.app or at a free Atlas cluster. k6 is an external AGPL tool; it is
// not a dependency and is not distributed with the template.
//
//   BASE_URL=https://staging.example.test PRODUCT_SLUGS=a,b CATEGORY_SLUGS=c,d k6 run load/k6/storefront-mix.js
//   STAGE=spike | soak selects the other profiles.
//
// This script covers the anonymous read mix (browse, product, search). Cart, sign-in, checkout
// and account traffic need synthetic accounts and SKUs made by a staging-only setup script, which
// does not exist yet; their share is listed in the plan and is not simulated here.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL;
if (!BASE) throw new Error("Set BASE_URL to a staging deployment");
const products = (__ENV.PRODUCT_SLUGS || "").split(",").filter(Boolean);
const categories = (__ENV.CATEGORY_SLUGS || "").split(",").filter(Boolean);
const terms = ["চাল", "তেল", "ডাল", "soap", "pen"];

const profiles = {
  ramp: [
    { duration: "5m", target: 5000 },
    { duration: "10m", target: 20000 },
    { duration: "10m", target: 50000 },
    { duration: "15m", target: 50000 },
    { duration: "5m", target: 0 },
  ],
  spike: [
    { duration: "2m", target: 50000 },
    { duration: "5m", target: 50000 },
    { duration: "2m", target: 0 },
  ],
  soak: [
    { duration: "10m", target: 10000 },
    { duration: "2h", target: 10000 },
    { duration: "5m", target: 0 },
  ],
};

export const options = {
  stages: profiles[__ENV.STAGE || "ramp"],
  thresholds: {
    "http_req_duration{kind:browse}": ["p(95)<800"],
    "http_req_duration{kind:product}": ["p(95)<1500"],
    "http_req_duration{kind:search}": ["p(95)<1500"],
    http_req_failed: ["rate<0.01"],
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function storefrontMix() {
  // Read-only shares from the plan, renormalised: browse 55, product 20, search 10 (of 85).
  const r = Math.random() * 85;
  let res;
  if (r < 55 || products.length === 0) {
    const path = categories.length && Math.random() < 0.6 ? `/c/${pick(categories)}` : "/";
    res = http.get(`${BASE}${path}`, { tags: { kind: "browse" } });
  } else if (r < 75) {
    res = http.get(`${BASE}/p/${pick(products)}`, { tags: { kind: "product" } });
  } else {
    res = http.get(`${BASE}/search?q=${encodeURIComponent(pick(terms))}`, { tags: { kind: "search" } });
  }
  check(res, { "status is 200": (x) => x.status === 200 });
  sleep(1 + Math.random() * 2);
}
