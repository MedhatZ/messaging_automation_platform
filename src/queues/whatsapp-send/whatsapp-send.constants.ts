/** BullMQ queue name for outbound WhatsApp Cloud API sends. */
export const WHATSAPP_SEND_QUEUE = 'whatsapp-send';

export const WHATSAPP_JOB_TEXT = 'text';
export const WHATSAPP_JOB_IMAGE = 'image';

/** Initial attempt plus 3 retries. */
export const WHATSAPP_SEND_ATTEMPTS = 4;

export const WHATSAPP_SEND_BACKOFF_MS = 2000;
