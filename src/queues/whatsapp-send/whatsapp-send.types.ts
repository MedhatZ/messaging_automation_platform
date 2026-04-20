export type WhatsappSendTextJobData = {
  /** Owning tenant (required for per-tenant fallback numbers). */
  tenantId: string;
  whatsappAccountId: string;
  to: string;
  message: string;
};

export type WhatsappSendImageJobData = {
  tenantId: string;
  whatsappAccountId: string;
  to: string;
  imageUrl: string;
  caption?: string;
};

/** Snapshot from BullMQ / Redis for observability and support tooling. */
export type WhatsappSendJobStatus = {
  id: string;
  name: string | undefined;
  state: string;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason: string;
  returnvalue: unknown;
};
