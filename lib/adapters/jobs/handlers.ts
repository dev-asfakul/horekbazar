// Outbox handlers by job type (domain-rules §13). Each handler is idempotent, passes the row's
// idempotencyKey to providers that support one, and returns only after the provider has *accepted*
// the request. None exist in B2: email arrives in B3, cache purge and search reindex in B4/B5,
// courier booking in B8, push in B9. A row whose type has no handler is retried, then dead-lettered.
import type { OutboxHandler } from "../../modules/platform/outbox.ts";

export const outboxHandlers: Record<string, OutboxHandler> = {};
