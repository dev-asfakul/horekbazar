// B9 part 2b on a disposable replica set (BUILD-PLAN B9 checkpoint "no AI text reaches a live field
// without approval"): a draft changes nothing live; applying one field writes only that field with the
// product version check and an audit row, never changes status; concurrent edits conflict; a bad
// answer stores nothing. Gemini is replaced by a local fetch stub; no network call is made.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import {
  applyDraftField,
  createProductDraft,
  discardDraft,
  openProductDrafts,
} from "@/lib/modules/ai/drafts";
import { AI_DRAFTS } from "@/lib/modules/ai/schema";
import {
  createCategory,
  getCategory,
  setCategoryStatus,
} from "@/lib/modules/catalogue/categories";
import { CatalogueError, type Actor } from "@/lib/modules/catalogue/common";
import {
  createProduct,
  createVariant,
  getProduct,
  setProductStatus,
  updateProduct,
} from "@/lib/modules/catalogue/products";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
let cat: string;
const actor: Actor = { id: "editor-1", role: "catalogue_editor", ip: null };
const config = { apiKey: "stub-key", model: "gemini-test" };

const DRAFT = {
  name: { bn: "মিনিকেট চাল ৫ কেজি", en: "Miniket Rice 5 kg" },
  shortDescription: {
    bn: "প্রতিদিনের ভাতের জন্য মিনিকেট চাল।",
    en: "Miniket rice for everyday meals.",
  },
  seoTitle: { bn: "মিনিকেট চাল ৫ কেজি", en: "Miniket Rice 5 kg" },
};
function gemini(payload: unknown) {
  const prompts: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    prompts.push(JSON.parse(String(init.body)).contents[0].parts[0].text);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    typeof payload === "string"
                      ? payload
                      : JSON.stringify(payload),
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { prompts, fetchImpl };
}
const code = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) =>
      e instanceof CatalogueError
        ? e.code
        : ((e as { code?: string }).code ?? String(e)),
  );

async function publishedProduct() {
  const id = String(
    await createProduct(db, client, actor, {
      slug: `ai-${randomUUID().slice(0, 8)}`,
      name: { bn: "চাল" },
      shortDescription: { bn: "পুরনো লেখা", en: "Old text" },
      seo: { description: { bn: "পুরনো এসইও", en: "Old SEO" } },
      primaryCategoryId: cat,
      categoryIds: [cat],
      attributes: [],
    }),
  );
  const v = String(
    await createVariant(db, client, actor, id, {
      sku: `AI-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: { bn: "৫ কেজি" },
      options: [],
      price: { amountMinor: 50000, currency: "BDT" },
      position: 0,
    }),
  );
  await moveStock(db, client, actor, {
    adjustmentId: randomUUID(),
    kind: "receive",
    lines: [{ variantId: v, qty: 3 }],
  });
  await setProductStatus(
    db,
    client,
    actor,
    id,
    (await getProduct(db, id))!.product.version,
    "published",
  );
  return id;
}

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  cat = String(
    await createCategory(db, client, actor, {
      slug: `ai-cat-${randomUUID().slice(0, 6)}`,
      parentId: null,
      name: { bn: "চাল", en: "Rice" },
      position: 1,
    }),
  );
  await setCategoryStatus(
    db,
    client,
    actor,
    cat,
    (await getCategory(db, cat))!.version,
    "published",
  );
});
afterAll(async () => cleanup());

describe("AI drafts (B9 part 2b)", () => {
  it("a draft changes nothing live; each applied field is versioned, audited and leaves status alone", async () => {
    const id = await publishedProduct();
    const before = (await getProduct(db, id))!.product;
    const g = gemini(DRAFT);
    const draftId = String(
      await createProductDraft(
        db,
        actor,
        id,
        {
          fields: ["name", "shortDescription", "seoTitle"],
          instructions: "family pack",
        },
        config,
        { fetchImpl: g.fetchImpl },
      ),
    );
    expect(g.prompts[0]).toContain("চাল");
    expect(g.prompts[0]).toContain("family pack");
    expect(g.prompts[0]).not.toContain("stub-key");
    const unchanged = (await getProduct(db, id))!.product;
    expect(unchanged).toEqual(before);
    const [draft] = await openProductDrafts(db, id);
    expect(draft).toMatchObject({
      status: "pending",
      targetVersion: before.version,
      model: "gemini-test",
      appliedFields: [],
      createdBy: "editor-1",
      version: 1,
    });

    const v1 = await applyDraftField(
      db,
      client,
      actor,
      draftId,
      "seoTitle",
      before.version,
      1,
    );
    let p = (await getProduct(db, id))!.product;
    expect(v1).toBe(before.version + 1);
    expect(p.version).toBe(v1);
    expect(p.status).toBe("published");
    expect(p.seo).toEqual({
      title: DRAFT.seoTitle,
      description: { bn: "পুরনো এসইও", en: "Old SEO" },
    });
    expect(p.name).toEqual(before.name);
    expect(p.shortDescription).toEqual(before.shortDescription);
    expect(
      await db.collection(AI_DRAFTS).findOne({}, { sort: { createdAt: -1 } }),
    ).toMatchObject({
      status: "partially_applied",
      appliedFields: ["seoTitle"],
      version: 2,
    });

    // The same field twice, a stale draft version, or the product version before the last apply: refused.
    expect(
      await code(
        applyDraftField(db, client, actor, draftId, "seoTitle", v1, 2),
      ),
    ).toBe("invalid");
    expect(
      await code(applyDraftField(db, client, actor, draftId, "name", v1, 1)),
    ).toBe("version_conflict");
    expect(
      await code(
        applyDraftField(db, client, actor, draftId, "name", before.version, 2),
      ),
    ).toBe("version_conflict");

    // Another editor saves the product meanwhile: applying with the version on screen conflicts.
    const edited = await updateProduct(db, client, actor, id, v1, {
      slug: p.slug,
      name: { bn: "চাল (হাতে বদলানো)" },
      shortDescription: p.shortDescription,
      primaryCategoryId: cat,
      categoryIds: [cat],
      attributes: [],
      seo: p.seo,
    });
    expect(
      await code(applyDraftField(db, client, actor, draftId, "name", v1, 2)),
    ).toBe("version_conflict");
    expect((await getProduct(db, id))!.product.name).toEqual({
      bn: "চাল (হাতে বদলানো)",
    });

    await applyDraftField(db, client, actor, draftId, "name", edited, 2);
    const last = await applyDraftField(
      db,
      client,
      actor,
      draftId,
      "shortDescription",
      edited + 1,
      3,
    );
    p = (await getProduct(db, id))!.product;
    expect(p).toMatchObject({
      name: DRAFT.name,
      shortDescription: DRAFT.shortDescription,
      status: "published",
      version: last,
    });
    expect(await openProductDrafts(db, id)).toHaveLength(0);
    expect(
      await db.collection(AI_DRAFTS).findOne({ _id: draft!._id }),
    ).toMatchObject({ status: "applied", version: 4 });
    const audits = await db
      .collection("auditLog")
      .find({ action: "product.ai_field_applied", "target.id": id })
      .toArray();
    expect(audits).toHaveLength(3);
    expect(
      await db
        .collection("auditLog")
        .countDocuments({ action: "ai.draft_created", "target.id": id }),
    ).toBe(1);
  });

  it("a discarded draft cannot be applied; a draft never publishes a draft product", async () => {
    const id = await publishedProduct();
    let p = (await getProduct(db, id))!.product;
    p.version = await setProductStatus(
      db,
      client,
      actor,
      id,
      p.version,
      "draft",
    );
    const draftId = String(
      await createProductDraft(db, actor, id, { fields: ["name"] }, config, {
        fetchImpl: gemini({ name: DRAFT.name }).fetchImpl,
      }),
    );
    await applyDraftField(db, client, actor, draftId, "name", p.version, 1);
    expect((await getProduct(db, id))!.product.status).toBe("draft");
    const second = String(
      await createProductDraft(
        db,
        actor,
        id,
        { fields: ["shortDescription"] },
        config,
        {
          fetchImpl: gemini({ shortDescription: DRAFT.shortDescription })
            .fetchImpl,
        },
      ),
    );
    await discardDraft(db, actor, second, 1);
    expect(await code(discardDraft(db, actor, second, 2))).toBe(
      "version_conflict",
    );
    p = (await getProduct(db, id))!.product;
    expect(
      await code(
        applyDraftField(
          db,
          client,
          actor,
          second,
          "shortDescription",
          p.version,
          2,
        ),
      ),
    ).toBe("version_conflict");
    expect(p.shortDescription).toEqual({ bn: "পুরনো লেখা", en: "Old text" });
  });

  it("an incomplete or over-long answer stores nothing", async () => {
    const id = await publishedProduct();
    const before = await db.collection(AI_DRAFTS).countDocuments();
    expect(
      await code(
        createProductDraft(db, actor, id, { fields: ["name"] }, config, {
          fetchImpl: gemini({ name: { bn: "চাল" } }).fetchImpl,
        }),
      ),
    ).toBe("ai_bad_output");
    expect(
      await code(
        createProductDraft(db, actor, id, { fields: ["seoTitle"] }, config, {
          fetchImpl: gemini({ seoTitle: { bn: "ক".repeat(71), en: "x" } })
            .fetchImpl,
        }),
      ),
    ).toBe("ai_bad_output");
    expect(
      await code(
        createProductDraft(db, actor, id, { fields: ["name"] }, config, {
          fetchImpl: gemini("not json").fetchImpl,
        }),
      ),
    ).toBe("ai_bad_output");
    expect(
      await code(
        createProductDraft(db, actor, id, { fields: [] }, config, {
          fetchImpl: gemini({}).fetchImpl,
        }),
      ),
    ).toBe("invalid");
    expect(
      await code(
        createProductDraft(
          db,
          actor,
          "0123456789abcdef01234567",
          { fields: ["name"] },
          config,
          { fetchImpl: gemini({ name: DRAFT.name }).fetchImpl },
        ),
      ),
    ).toBe("not_found");
    expect(await db.collection(AI_DRAFTS).countDocuments()).toBe(before);
  });
});
