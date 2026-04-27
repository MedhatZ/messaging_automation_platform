export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    name: process.env.APP_NAME ?? 'messaging-automation-platform',
    /** Absolute base URL for links returned to clients (uploads, etc.). */
    publicBaseUrl:
      process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ??
      `http://localhost:${parseInt(process.env.PORT ?? '3000', 10)}`,
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    url: (process.env.REDIS_URL ?? '').trim(),
  },
  rateLimit: {
    /** Per-tenant Meta webhook message handling (fixed 60s window). */
    webhookPerMinute: parseInt(
      process.env.RATE_LIMIT_WEBHOOK_PER_MINUTE ?? '60',
      10,
    ),
    /** Per-tenant outbound WhatsApp jobs enqueued per minute. */
    outboundPerMinute: parseInt(
      process.env.RATE_LIMIT_OUTBOUND_PER_MINUTE ?? '300',
      10,
    ),
  },
  whatsapp: {
    /** App secret from Meta (e.g. webhook signature validation — reserved). */
    metaAppSecret: (process.env.META_APP_SECRET ?? '').trim(),
    /** Fallback GET /webhook verify when no DB row matches `hub.verify_token`. */
    defaultVerifyToken: (process.env.DEFAULT_VERIFY_TOKEN ?? '').trim(),
    /**
     * Optional: base64 of 32 bytes. If unset, derives AES key from JWT secret (dev only).
     */
    tokenEncryptionKey: (process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '').trim(),
    /**
     * Optional: recipient phone for "Test connection" (E.164, digits, optional leading +).
     * If unset, /whatsapp-accounts/:id/test will return a clear error.
     */
    testTo: (process.env.WHATSAPP_TEST_TO ?? '').trim(),

    /** Optional: Meta Commerce catalog id for product_list interactive messages. */
    catalogId: (process.env.WHATSAPP_CATALOG_ID ?? '').trim(),
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    timeoutMs: parseInt(process.env.ANTHROPIC_TIMEOUT_MS ?? '15000', 10),
  },
  jwt: {
    secret:
      process.env.JWT_SECRET ??
      'development-only-jwt-secret-change-in-production!!',
    /** Access token TTL in seconds (default 7 days). */
    expiresInSeconds: parseInt(process.env.JWT_EXPIRES_SEC ?? '604800', 10),
  },
  baileys: {
    enabled: (process.env.BAILEYS_ENABLED ?? '').trim(),
    tenantId: (process.env.BAILEYS_TENANT_ID ?? '').trim(),
  },
});
