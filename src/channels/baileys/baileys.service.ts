import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { EventEmitter2 } from '@nestjs/event-emitter';
import pino from 'pino';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrcode = require('qrcode-terminal') as {
  generate: (text: string, opts?: { small?: boolean }) => void;
};

type TenantSession = {
  tenantId: string;
  sock: ReturnType<typeof makeWASocket> | null;
  qrString: string | null;
  status: 'disconnected' | 'connecting' | 'connected';
};

@Injectable()
export class BaileysService implements OnModuleInit {
  private readonly logger = new Logger(BaileysService.name);
  private readonly sessions = new Map<string, TenantSession>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    if (process.env.BAILEYS_ENABLED !== 'true') {
      this.logger.log('Baileys disabled (set BAILEYS_ENABLED=true to enable)');
      return;
    }
    this.logger.log(
      'Baileys enabled. Multi-tenant sessions are created on demand via API.',
    );
  }

  getStatus(tenantId: string): {
    tenantId: string;
    status: TenantSession['status'];
    qr: string | null;
  } {
    const s = this.sessions.get(tenantId);
    if (!s) {
      return { tenantId, status: 'disconnected', qr: null };
    }
    return { tenantId, status: s.status, qr: s.qrString };
  }

  async connectTenant(tenantId: string): Promise<void> {
    if (process.env.BAILEYS_ENABLED !== 'true') {
      throw new Error('Baileys is disabled (set BAILEYS_ENABLED=true to enable)');
    }

    const existing = this.sessions.get(tenantId);
    if (existing?.status === 'connected' || existing?.status === 'connecting') {
      return;
    }

    const next: TenantSession = {
      tenantId,
      sock: null,
      qrString: null,
      status: 'connecting',
    };
    this.sessions.set(tenantId, next);

    await this.connect(tenantId);
  }

  async disconnectTenant(tenantId: string): Promise<void> {
    const s = this.sessions.get(tenantId);
    if (!s) return;
    try {
      await s.sock?.logout();
    } catch {
      // ignore
    }
    try {
      s.sock?.end(new Error('manual_disconnect'));
    } catch {
      // ignore
    }
    this.sessions.delete(tenantId);
  }

  private async connect(tenantId: string) {
    const authFolder = path.join(process.cwd(), 'baileys_auth', tenantId);
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
    });

    const session = this.sessions.get(tenantId);
    if (!session) return;
    session.sock = sock;
    session.status = 'connecting';

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const s = this.sessions.get(tenantId);
        if (s) {
          s.qrString = qr;
          s.status = 'connecting';
        }
        qrcode.generate(qr, { small: true });
        this.logger.log(`QR Code generated for tenant=${tenantId}`);
        this.eventEmitter.emit('baileys.qr', { tenantId, qr });
      }

      if (connection === 'close') {
        const s = this.sessions.get(tenantId);
        if (s) {
          s.qrString = null;
          s.status = 'disconnected';
        }
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        this.logger.warn(
          `Connection closed for tenant=${tenantId}. Reconnect: ${shouldReconnect}`,
        );
        if (shouldReconnect) {
          await this.connect(tenantId);
        } else {
          this.sessions.delete(tenantId);
        }
      }

      if (connection === 'open') {
        const s = this.sessions.get(tenantId);
        if (s) {
          s.qrString = null;
          s.status = 'connected';
        }
        this.logger.log(`WhatsApp connected via Baileys ✅ tenant=${tenantId}`);
        this.eventEmitter.emit('baileys.connected', { tenantId });
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const from = msg.key.remoteJid;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          '';
        if (!from || !text) continue;
        this.eventEmitter.emit('baileys.message', { tenantId, from, text, msg });
      }
    });
  }

  async sendText(
    tenantId: string,
    to: string,
    message: string,
  ): Promise<void> {
    const s = this.sessions.get(tenantId);
    if (!s?.sock) throw new Error('Baileys not connected');
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await s.sock.sendMessage(jid, { text: message });
  }

  async sendImage(
    tenantId: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    const s = this.sessions.get(tenantId);
    if (!s?.sock) throw new Error('Baileys not connected');
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await s.sock.sendMessage(jid, {
      image: { url: imageUrl },
      caption: caption ?? '',
    });
  }
}

