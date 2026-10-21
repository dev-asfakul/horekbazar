// Category tree service (SCHEMA.md → Category depth). MongoDB validators cannot express ancestry,
// so the depth-3 and no-cycle rules live here:
// - depth = categories on the path from the root, inclusive (a top-level category has depth 1);
// - create: depth(parent) + 1 ≤ 3; move: depth(new parent) + height(subtree) ≤ 3, and never under
//   itself or a descendant; ancestors are walked with a visited set so stored corruption is detected.
// Every structural change (create, move, delete) also increments one tree lock document inside its
// transaction, so concurrent structural changes conflict and are retried against the committed tree
// instead of each passing its check against a stale snapshot (two moves could otherwise form a cycle).
import type { ClientSession, Db, MongoClient, ObjectId } from "mongodb";
import { recordAudit } from "../platform/audit.ts";
import { CatalogueError, defined, inTransaction, isDevelopmentDatabase, toObjectId, unsetMissing, type Actor } from "./common.ts";
import { CATALOGUE_LOCKS } from "./locks.ts";
import { CATEGORIES, MAX_CATEGORY_DEPTH, PRODUCTS, type CategoryDoc, type LocalizedText } from "./schema.ts";

type TreeNode = { _id: ObjectId; parentId: ObjectId | null };
type Tree = Map<string, TreeNode>;

const categories = (db: Db) => db.collection<CategoryDoc>(CATEGORIES);

async function loadTree(db: Db, session?: ClientSession): Promise<Tree> {
  const nodes = await categories(db)
    .find({}, { projection: { _id: 1, parentId: 1 }, ...(session ? { session } : {}) })
    .toArray();
  return new Map(nodes.map((n) => [String(n._id), { _id: n._id, parentId: n.parentId ?? null }]));
}

/** Depth of `id` (1 for a root). Throws `cycle` if the stored ancestor chain loops. */
export function depthOf(tree: Tree, id: string): number {
  const visited = new Set<string>();
  let current: string | null = id;
  let depth = 0;
  while (current) {
    if (visited.has(current)) throw new CatalogueError("cycle");
    visited.add(current);
    const node = tree.get(current);
    if (!node) throw new CatalogueError("parent_not_found");
    depth += 1;
    current = node.parentId ? String(node.parentId) : null;
  }
  return depth;
}

/** Height of the subtree rooted at `id`, counting `id` itself (a leaf has height 1). */
export function heightOf(tree: Tree, id: string): number {
  const children = new Map<string, string[]>();
  for (const node of tree.values()) {
    if (!node.parentId) continue;
    const key = String(node.parentId);
    children.set(key, [...(children.get(key) ?? []), String(node._id)]);
  }
  const visited = new Set<string>();
  const walk = (node: string): number => {
    if (visited.has(node)) throw new CatalogueError("cycle");
    visited.add(node);
    const kids = children.get(node) ?? [];
    return 1 + (kids.length ? Math.max(...kids.map(walk)) : 0);
  };
  return walk(id);
}

/** True when `candidate` is `id` or lies inside the subtree of `id`. */
export function isInSubtree(tree: Tree, id: string, candidate: string): boolean {
  const visited = new Set<string>();
  let current: string | null = candidate;
  while (current) {
    if (current === id) return true;
    if (visited.has(current)) throw new CatalogueError("cycle");
    visited.add(current);
    const node = tree.get(current);
    current = node?.parentId ? String(node.parentId) : null;
  }
  return false;
}

async function lockTree(db: Db, session: ClientSession) {
  await db.collection<{ _id: string; seq: number; updatedAt: Date }>(CATALOGUE_LOCKS).updateOne(
    { _id: "categoryTree" },
    { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, session },
  );
}

const actorOf = (actor: Actor) => ({ id: actor.id, role: actor.role });
const snapshot = (doc: Partial<CategoryDoc>) => ({
  slug: doc.slug,
  parentId: doc.parentId ? String(doc.parentId) : null,
  name: doc.name,
  description: doc.description,
  position: doc.position,
  seo: doc.seo,
  status: doc.status,
});

export interface CategoryInput {
  slug: string;
  parentId: string | null;
  name: LocalizedText;
  description?: LocalizedText | undefined;
  position: number;
  seo?: CategoryDoc["seo"] | undefined;
  sample?: true | undefined;
}

export async function listCategories(db: Db) {
  return categories(db).find({}).sort({ position: 1, slug: 1 }).toArray();
}

export async function getCategory(db: Db, id: string) {
  return categories(db).findOne({ _id: toObjectId(id) });
}

export async function createCategory(db: Db, client: MongoClient, actor: Actor, input: CategoryInput): Promise<ObjectId> {
  return inTransaction(client, async (session) => {
    await lockTree(db, session);
    if (await categories(db).findOne({ slug: input.slug }, { session, projection: { _id: 1 } })) throw new CatalogueError("slug_taken");
    let parentId: ObjectId | null = null;
    if (input.parentId) {
      parentId = toObjectId(input.parentId);
      const tree = await loadTree(db, session);
      if (!tree.has(String(parentId))) throw new CatalogueError("parent_not_found");
      if (depthOf(tree, String(parentId)) + 1 > MAX_CATEGORY_DEPTH) throw new CatalogueError("depth_exceeded", { max: MAX_CATEGORY_DEPTH });
      if (await db.collection(PRODUCTS).findOne({ primaryCategoryId: parentId }, { session, projection: { _id: 1 } })) throw new CatalogueError("parent_has_products");
    }
    const now = new Date();
    const doc = defined({
      slug: input.slug,
      parentId,
      name: input.name,
      description: input.description,
      position: input.position,
      seo: input.seo,
      status: "draft" as const,
      sample: input.sample,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }) as Omit<CategoryDoc, "_id">;
    const { insertedId } = await categories(db).insertOne(doc as CategoryDoc, { session });
    await recordAudit(db, { actor: actorOf(actor), action: "category.created", target: { type: "category", id: String(insertedId) }, after: snapshot(doc), ip: actor.ip ?? null }, { session, now });
    return insertedId;
  });
}

export interface CategoryPatch {
  slug: string;
  name: LocalizedText;
  description?: LocalizedText | undefined;
  position: number;
  seo?: CategoryDoc["seo"] | undefined;
}

/** Edits the fields; the slug is frozen once the category has been published (domain-rules §10). */
export async function updateCategory(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, patch: CategoryPatch) {
  const _id = toObjectId(id);
  return inTransaction(client, async (session) => {
    const before = await categories(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (patch.slug !== before.slug) {
      if (before.publishedAt) throw new CatalogueError("slug_locked");
      if (await categories(db).findOne({ slug: patch.slug, _id: { $ne: _id } }, { session, projection: { _id: 1 } })) throw new CatalogueError("slug_taken");
    }
    const now = new Date();
    const result = await categories(db).updateOne(
      { _id, version: expectedVersion },
      {
        $set: defined({ slug: patch.slug, name: patch.name, description: patch.description, position: patch.position, seo: patch.seo, updatedAt: now }),
        $inc: { version: 1 },
        ...unsetMissing(patch, ["description", "seo"]),
      },
      { session },
    );
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(db, { actor: actorOf(actor), action: "category.updated", target: { type: "category", id }, before: snapshot(before), after: snapshot({ ...before, ...patch }), ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}

export async function moveCategory(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, newParentId: string | null) {
  const _id = toObjectId(id);
  const parent = newParentId ? toObjectId(newParentId) : null;
  return inTransaction(client, async (session) => {
    await lockTree(db, session);
    const before = await categories(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    const tree = await loadTree(db, session);
    let parentDepth = 0;
    if (parent) {
      if (!tree.has(String(parent))) throw new CatalogueError("parent_not_found");
      if (isInSubtree(tree, id, String(parent))) throw new CatalogueError("cycle");
      parentDepth = depthOf(tree, String(parent));
      if (await db.collection(PRODUCTS).findOne({ primaryCategoryId: parent }, { session, projection: { _id: 1 } })) throw new CatalogueError("parent_has_products");
      const parentDoc = await categories(db).findOne({ _id: parent }, { session, projection: { status: 1 } });
      if (before.status === "published" && parentDoc?.status !== "published") throw new CatalogueError("parent_unpublished");
    }
    if (parentDepth + heightOf(tree, id) > MAX_CATEGORY_DEPTH) throw new CatalogueError("depth_exceeded", { max: MAX_CATEGORY_DEPTH });
    const now = new Date();
    const result = await categories(db).updateOne({ _id, version: expectedVersion }, { $set: { parentId: parent, updatedAt: now }, $inc: { version: 1 } }, { session });
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(
      db,
      { actor: actorOf(actor), action: "category.moved", target: { type: "category", id }, before: { parentId: before.parentId ? String(before.parentId) : null }, after: { parentId: parent ? String(parent) : null }, ip: actor.ip ?? null },
      { session, now },
    );
    return expectedVersion + 1;
  });
}

/**
 * Status changes. Publish needs a published parent (a visible category is never under a hidden one).
 * Archive needs every child archived and no product still using it as primary category. Restoring an
 * archived category returns it to draft.
 */
export async function setCategoryStatus(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, status: CategoryDoc["status"]) {
  const _id = toObjectId(id);
  return inTransaction(client, async (session) => {
    const before = await categories(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (before.status === status) return before.version;
    if (status === "published") {
      if (before.sample && !isDevelopmentDatabase(db)) throw new CatalogueError("sample_publish_blocked");
      if (before.parentId) {
        const parent = await categories(db).findOne({ _id: before.parentId }, { session, projection: { status: 1 } });
        if (parent?.status !== "published") throw new CatalogueError("parent_unpublished");
      }
    } else {
      // Moving to draft or archived hides the category: its children must already be hidden.
      const visibleChild = await categories(db).findOne({ parentId: _id, status: status === "archived" ? { $ne: "archived" } : "published" }, { session, projection: { _id: 1 } });
      if (visibleChild) throw new CatalogueError("has_children");
      // Archive: no product may still use it (draft or published). Unpublish: no published product may.
      const productStatus = status === "archived" ? { $ne: "archived" } : "published";
      if (await db.collection(PRODUCTS).findOne({ primaryCategoryId: _id, status: productStatus }, { session, projection: { _id: 1 } })) {
        throw new CatalogueError("has_products");
      }
    }
    const now = new Date();
    const result = await categories(db).updateOne(
      { _id, version: expectedVersion },
      { $set: { status, updatedAt: now, ...(status === "published" && !before.publishedAt ? { publishedAt: now } : {}) }, $inc: { version: 1 } },
      { session },
    );
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(db, { actor: actorOf(actor), action: `category.${status}`, target: { type: "category", id }, before: { status: before.status }, after: { status }, ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}

/** Deletes a category that was never published and is unused (no children, no products). */
export async function deleteCategory(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number) {
  const _id = toObjectId(id);
  await inTransaction(client, async (session) => {
    await lockTree(db, session);
    const before = await categories(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (before.publishedAt) throw new CatalogueError("in_use");
    if (await categories(db).findOne({ parentId: _id }, { session, projection: { _id: 1 } })) throw new CatalogueError("has_children");
    if (await db.collection(PRODUCTS).findOne({ $or: [{ primaryCategoryId: _id }, { categoryIds: _id }] }, { session, projection: { _id: 1 } })) throw new CatalogueError("has_products");
    await categories(db).deleteOne({ _id, version: expectedVersion }, { session });
    await recordAudit(db, { actor: actorOf(actor), action: "category.deleted", target: { type: "category", id }, before: snapshot(before), ip: actor.ip ?? null }, { session });
  });
}
