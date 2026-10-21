// Serialisation documents for catalogue rules that span several documents (proposed SCHEMA.md
// addition, B4). Structural category changes increment `categoryTree.seq` inside their transaction,
// so two concurrent changes write the same document and one of them is retried by the driver.
import { z } from "zod";
import { zDate, zInt } from "../../db/bson-zod.ts";

export const CATALOGUE_LOCKS = "catalogueLocks";

export const catalogueLockSchema = z
  .object({
    _id: z.enum(["categoryTree"]),
    seq: zInt().min(1),
    updatedAt: zDate(),
  })
  .strict();
export type CatalogueLockDoc = z.infer<typeof catalogueLockSchema>;
