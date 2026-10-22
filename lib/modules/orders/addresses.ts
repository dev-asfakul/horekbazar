// Customer addresses (B7; D13 phone rule; D21(b) interim location: store zone + free-text district
// and area until D12). Owned by the signed-in customer: every query filters by userId, so one
// customer can never read or change another's address. At most 10; exactly one default when any exist.
import { ObjectId, type Db } from "mongodb";
import { CommerceError } from "../pricing/cart.ts";
import { loadSettingsFor } from "../pricing/quote.ts";
import { ADDRESSES, MAX_ADDRESSES, type AddressDoc } from "./schema.ts";

export interface AddressInput {
  label: AddressDoc["label"];
  name: string;
  phone: string;
  zoneId: string;
  district: string;
  area: string;
  line: string;
  landmark?: string | undefined;
  isDefault?: boolean | undefined;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Accepts 01XXXXXXXXX, +8801XXXXXXXXX, 8801…, with spaces/dashes and Bengali digits; returns E.164 or null. */
export function normaliseBdPhone(raw: string): string | null {
  const digits = raw.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).replace(/[\s-]/g, "");
  const m = /^(?:\+?880|0)?(1[3-9]\d{8})$/.exec(digits);
  return m ? `+880${m[1]}` : null;
}

/** +8801712345678 → 01712-345678 for display. */
export const displayBdPhone = (e164: string) => (e164.startsWith("+880") ? `0${e164.slice(4, 8)}-${e164.slice(8)}` : e164);

const addresses = (db: Db) => db.collection<AddressDoc>(ADDRESSES);
const oid = (id: string) => {
  if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) throw new CommerceError("not_found");
  return new ObjectId(id);
};

export async function listAddresses(db: Db, userId: string): Promise<AddressDoc[]> {
  return addresses(db).find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).limit(MAX_ADDRESSES).toArray();
}

export async function getAddress(db: Db, userId: string, id: string): Promise<AddressDoc | null> {
  return addresses(db).findOne({ _id: oid(id), userId });
}

async function clean(db: Db, input: AddressInput) {
  const phone = normaliseBdPhone(input.phone);
  if (!phone) throw new CommerceError("phone_invalid");
  const zones = (await loadSettingsFor(db)).delivery.zones.filter((z) => z.enabled);
  if (!zones.some((z) => z.id === input.zoneId)) throw new CommerceError("zone_unavailable");
  const t = (v: string) => v.trim();
  return { label: input.label, name: t(input.name), phone, zoneId: input.zoneId, district: t(input.district), area: t(input.area), line: t(input.line), ...(input.landmark?.trim() ? { landmark: input.landmark.trim() } : {}) };
}

export async function createAddress(db: Db, userId: string, input: AddressInput): Promise<ObjectId> {
  const fields = await clean(db, input);
  const count = await addresses(db).countDocuments({ userId });
  if (count >= MAX_ADDRESSES) throw new CommerceError("address_limit");
  const now = new Date();
  const isDefault = count === 0 || Boolean(input.isDefault);
  const doc: AddressDoc = { _id: new ObjectId(), userId, ...fields, isDefault, version: 1, createdAt: now, updatedAt: now };
  if (isDefault) await addresses(db).updateMany({ userId, isDefault: true }, { $set: { isDefault: false, updatedAt: now }, $inc: { version: 1 } });
  await addresses(db).insertOne(doc);
  return doc._id;
}

export async function updateAddress(db: Db, userId: string, id: string, version: number, input: AddressInput) {
  const fields = await clean(db, input);
  const now = new Date();
  const unset = fields.landmark ? {} : { $unset: { landmark: "" as const } };
  const res = await addresses(db).updateOne({ _id: oid(id), userId, version }, { $set: { ...fields, updatedAt: now }, $inc: { version: 1 }, ...unset });
  if (res.matchedCount === 0) throw new CommerceError((await addresses(db).countDocuments({ _id: oid(id), userId })) ? "version_conflict" : "not_found");
  if (input.isDefault) await setDefaultAddress(db, userId, id);
}

export async function setDefaultAddress(db: Db, userId: string, id: string) {
  const _id = oid(id);
  if (!(await addresses(db).countDocuments({ _id, userId }))) throw new CommerceError("not_found");
  const now = new Date();
  await addresses(db).updateMany({ userId, isDefault: true, _id: { $ne: _id } }, { $set: { isDefault: false, updatedAt: now }, $inc: { version: 1 } });
  await addresses(db).updateOne({ _id, userId, isDefault: false }, { $set: { isDefault: true, updatedAt: now }, $inc: { version: 1 } });
}

export async function deleteAddress(db: Db, userId: string, id: string) {
  const removed = await addresses(db).findOneAndDelete({ _id: oid(id), userId });
  if (!removed) throw new CommerceError("not_found");
  if (removed.isDefault) {
    const next = await addresses(db).find({ userId }).sort({ updatedAt: -1 }).limit(1).next();
    if (next) await addresses(db).updateOne({ _id: next._id }, { $set: { isDefault: true, updatedAt: new Date() }, $inc: { version: 1 } });
  }
}
