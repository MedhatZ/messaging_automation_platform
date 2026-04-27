export type WhatsappSendTextJobData = {
  /** Owning tenant (required for per-tenant fallback numbers). */
  tenantId: string;
  whatsappAccountId: string;
  to: string;
  message: string;
  followUp?: {
    conversationId: string;
    scheduledAt: string; // ISO string
  };
};

export type WhatsappSendImageJobData = {
  tenantId: string;
  whatsappAccountId: string;
  to: string;
  imageUrl: string;
  caption?: string;
};

export type WhatsappSendVideoJobData = {
  tenantId: string;
  whatsappAccountId: string;
  to: string;
  videoUrl: string;
  caption?: string;
};

export type WhatsappSendProductListJobData = {
  tenantId: string;
  whatsappAccountId: string;
  to: string;
  catalogId: string;
  headerText?: string;
  bodyText?: string;
  productRetailerIds: string[];
};

export type WhatsappSendInteractiveButtonsJobData = {
  tenantId: string;
  whatsappAccountId: string;
  to: string;
  bodyText: string;
  buttons: { id: string; title: string }[];
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
