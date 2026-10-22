// Messaging schema (B9; SCHEMA.md → conversations, messages; domain-rules §10.4 "Messaging").
// A signed-in customer opens a conversation with the store, optionally about one of their orders;
// staff with `messages.reply` answer. Plain text only. Delivery is by polling (the page refreshes
// itself); realtime push through the Ably adapter is optional and not required for correctness.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";

export const CONVERSATIONS = "conversations";
export const MESSAGES = "messages";
export const CONVERSATION_STATUSES = ["open", "closed"] as const;

export const conversationSchema = z
  .object({
    _id: zObjectId(),
    userId: z.string().min(1).max(100),
    /** Customer display name snapshot for the staff inbox (no e-mail address). */
    customerName: z.string().trim().min(1).max(120),
    subject: z.string().trim().min(1).max(120),
    orderId: zObjectId().optional(),
    orderNumber: z.string().min(1).max(40).optional(),
    status: z.enum(CONVERSATION_STATUSES),
    lastMessageAt: zDate(),
    lastFrom: z.enum(["customer", "staff"]),
    /** Messages the other side has not opened yet. */
    unreadByStaff: zInt().min(0),
    unreadByCustomer: zInt().min(0),
    messageCount: zInt().min(0).max(500),
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type ConversationDoc = z.infer<typeof conversationSchema>;

export const messageSchema = z
  .object({
    _id: zObjectId(),
    conversationId: zObjectId(),
    from: z.enum(["customer", "staff"]),
    authorId: z.string().min(1).max(100),
    body: z.string().trim().min(1).max(2000),
    /** Client-generated key: a resubmitted form never posts the same message twice. */
    clientKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
    createdAt: zDate(),
  })
  .strict();
export type MessageDoc = z.infer<typeof messageSchema>;
