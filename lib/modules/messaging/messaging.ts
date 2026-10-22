// Messaging service (B9; domain-rules §10.4). Customers may only read and write their own
// conversations; an order reference is accepted only for the customer's own order. Staff need
// `messages.reply`. Each message carries a client key (unique per conversation) so a double submit
// or a retried request posts once. A conversation holds at most 500 messages; closing is staff-only
// and a new customer message reopens it.
import { ObjectId, type Db } from "mongodb";
import { inTransaction, isDuplicateKey, toObjectId, type Actor } from "../catalogue/common.ts";
import type { MongoClient } from "mongodb";
import { ORDERS, type OrderDoc } from "../orders/schema.ts";
import { recordAudit } from "../platform/audit.ts";
import { CommerceError } from "../pricing/cart.ts";
import { CONVERSATIONS, MESSAGES, conversationSchema, messageSchema, type ConversationDoc, type MessageDoc } from "./schema.ts";

export const MAX_MESSAGES = 500;

const clean = (s: string) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
const oid = (id: string) => {
  try {
    return toObjectId(id);
  } catch {
    throw new CommerceError("not_found");
  }
};
const validKey = (k: string) => /^[A-Za-z0-9-]{16,64}$/.test(k);

export interface Customer {
  id: string;
  name: string;
}

/** Opens a conversation with its first message. The same client key returns the same conversation. */
export async function startConversation(client: MongoClient, db: Db, customer: Customer, input: { subject: string; body: string; orderNumber?: string; clientKey: string }, now = new Date()) {
  const subject = clean(input.subject);
  const body = clean(input.body);
  if (!subject || subject.length > 120 || !body || body.length > 2000) throw new CommerceError("message_invalid");
  if (!validKey(input.clientKey)) throw new CommerceError("idempotency_key_invalid");
  const prior = await db.collection<MessageDoc>(MESSAGES).findOne({ clientKey: input.clientKey, authorId: customer.id });
  if (prior) return { id: String(prior.conversationId), created: false };
  let order: Pick<OrderDoc, "_id" | "orderNumber"> | null = null;
  if (input.orderNumber?.trim()) {
    order = await db.collection<OrderDoc>(ORDERS).findOne({ orderNumber: input.orderNumber.trim().toUpperCase(), userId: customer.id }, { projection: { orderNumber: 1 } });
    if (!order) throw new CommerceError("not_found");
  }
  const conv: ConversationDoc = {
    _id: new ObjectId(),
    userId: customer.id,
    customerName: customer.name.trim().slice(0, 120) || "Customer",
    subject,
    ...(order ? { orderId: order._id, orderNumber: order.orderNumber } : {}),
    status: "open",
    lastMessageAt: now,
    lastFrom: "customer",
    unreadByStaff: 1,
    unreadByCustomer: 0,
    messageCount: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const msg: MessageDoc = { _id: new ObjectId(), conversationId: conv._id, from: "customer", authorId: customer.id, body, clientKey: input.clientKey, createdAt: now };
  if (!conversationSchema.safeParse(conv).success || !messageSchema.safeParse(msg).success) throw new CommerceError("message_invalid");
  try {
    await inTransaction(client, async (session) => {
      await db.collection<ConversationDoc>(CONVERSATIONS).insertOne(conv, { session });
      await db.collection<MessageDoc>(MESSAGES).insertOne(msg, { session });
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const again = await db.collection<MessageDoc>(MESSAGES).findOne({ clientKey: input.clientKey, authorId: customer.id });
    if (again) return { id: String(again.conversationId), created: false };
    throw error;
  }
  return { id: String(conv._id), created: true };
}

type Author = { from: "customer"; customer: Customer } | { from: "staff"; actor: Actor };

/** Adds a message. Customers only to their own conversation; a customer message reopens a closed one. */
export async function postMessage(client: MongoClient, db: Db, author: Author, conversationId: string, input: { body: string; clientKey: string }, now = new Date()) {
  const body = clean(input.body);
  if (!body || body.length > 2000) throw new CommerceError("message_invalid");
  if (!validKey(input.clientKey)) throw new CommerceError("idempotency_key_invalid");
  const convs = db.collection<ConversationDoc>(CONVERSATIONS);
  const conv = await convs.findOne({ _id: oid(conversationId) });
  if (!conv || (author.from === "customer" && conv.userId !== author.customer.id)) throw new CommerceError("not_found");
  const authorId = author.from === "customer" ? author.customer.id : author.actor.id;
  const existing = await db.collection<MessageDoc>(MESSAGES).findOne({ authorId, clientKey: input.clientKey });
  if (existing) {
    if (!existing.conversationId.equals(conv._id)) throw new CommerceError("idempotency_key_reused");
    return { id: String(existing._id), created: false };
  }
  if (author.from === "staff" && conv.status === "closed") throw new CommerceError("conversation_closed");
  const msg: MessageDoc = { _id: new ObjectId(), conversationId: conv._id, from: author.from, authorId, body, clientKey: input.clientKey, createdAt: now };
  try {
    await inTransaction(client, async (session) => {
      const res = await convs.updateOne(
        // Staff may only post while it is open, re-checked here in case it was closed meanwhile.
        { _id: conv._id, messageCount: { $lt: MAX_MESSAGES }, ...(author.from === "staff" ? { status: "open" as const } : {}) },
        {
          $set: { lastMessageAt: now, lastFrom: author.from, updatedAt: now, ...(author.from === "customer" ? { status: "open" as const } : {}) },
          $inc: { messageCount: 1, version: 1, ...(author.from === "customer" ? { unreadByStaff: 1 } : { unreadByCustomer: 1 }) },
        },
        { session },
      );
      if (res.matchedCount !== 1) throw new CommerceError(author.from === "staff" && (await convs.findOne({ _id: conv._id }, { session, projection: { status: 1 } }))?.status === "closed" ? "conversation_closed" : "conversation_full");
      await db.collection<MessageDoc>(MESSAGES).insertOne(msg, { session });
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const again = await db.collection<MessageDoc>(MESSAGES).findOne({ authorId, clientKey: input.clientKey });
      if (again) return { id: String(again._id), created: false };
    }
    throw error;
  }
  if (author.from === "staff") {
    await recordAudit(db, { actor: { id: author.actor.id, role: author.actor.role }, action: "message.replied", target: { type: "conversation", id: String(conv._id) }, ip: author.actor.ip ?? null }, { now });
  }
  return { id: String(msg._id), created: true };
}

/** Reads a conversation and marks the other side's messages as read for the reader. */
export async function readConversation(db: Db, reader: { from: "customer"; userId: string } | { from: "staff" }, conversationId: string) {
  const convs = db.collection<ConversationDoc>(CONVERSATIONS);
  const conv = await convs.findOne({ _id: oid(conversationId) });
  if (!conv || (reader.from === "customer" && conv.userId !== reader.userId)) return null;
  const field = reader.from === "customer" ? "unreadByCustomer" : "unreadByStaff";
  // Clear only if no message arrived since it was read (messageCount is unchanged), so a message
  // posted at the same moment stays unread instead of being marked as seen without being shown.
  if (conv[field] > 0) await convs.updateOne({ _id: conv._id, messageCount: conv.messageCount }, { $set: { [field]: 0 } });
  const messages = await db.collection<MessageDoc>(MESSAGES).find({ conversationId: conv._id }).sort({ createdAt: 1, _id: 1 }).limit(MAX_MESSAGES).toArray();
  return { conversation: { ...conv, [field]: 0 }, messages };
}

export const customerConversations = (db: Db, userId: string) => db.collection<ConversationDoc>(CONVERSATIONS).find({ userId }).sort({ lastMessageAt: -1 }).limit(50).toArray();

export async function staffInbox(db: Db, filter: { status?: "open" | "closed"; page?: number }, pageSize = 25) {
  const page = Math.max(1, filter.page ?? 1);
  const q = { status: filter.status ?? "open" };
  const col = db.collection<ConversationDoc>(CONVERSATIONS);
  const [items, total] = await Promise.all([col.find(q).sort({ lastMessageAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), col.countDocuments(q)]);
  return { items, total, page, pageSize };
}

/** Staff close or reopen (compare-and-set on version, audited). */
export async function setConversationStatus(db: Db, actor: Actor, conversationId: string, expectedVersion: number, status: "open" | "closed", now = new Date()) {
  const convs = db.collection<ConversationDoc>(CONVERSATIONS);
  const conv = await convs.findOne({ _id: oid(conversationId) });
  if (!conv) throw new CommerceError("not_found");
  if (conv.status === status) throw new CommerceError("transition_not_allowed");
  const res = await convs.updateOne({ _id: conv._id, version: expectedVersion }, { $set: { status, updatedAt: now }, $inc: { version: 1 } });
  if (res.matchedCount !== 1) throw new CommerceError("version_conflict");
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: `conversation.${status === "closed" ? "closed" : "reopened"}`, target: { type: "conversation", id: String(conv._id) }, before: { status: conv.status }, after: { status }, ip: actor.ip ?? null }, { now });
}
