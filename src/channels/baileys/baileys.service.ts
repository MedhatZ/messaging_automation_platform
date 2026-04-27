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

@Injectable()
export class BaileysService implements OnModuleInit {
  private readonly logger = new Logger(BaileysService.name);
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private qrString: string | null = null;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    if (process.env.BAILEYS_ENABLED !== 'true') {
      this.logger.log('Baileys disabled (set BAILEYS_ENABLED=true to enable)');
      return;
    }
    await this.connect();
  }

  getQR(): string | null {
    return this.qrString;
  }

  private async connect() {
    const authFolder = path.join(process.cwd(), 'baileys_auth');
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrString = qr;
        qrcode.generate(qr, { small: true });
        this.logger.log('QR Code generated — scan with WhatsApp');
        this.eventEmitter.emit('baileys.qr', qr);
      }

      if (connection === 'close') {
        this.qrString = null;
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        this.logger.warn(`Connection closed. Reconnect: ${shouldReconnect}`);
        if (shouldReconnect) {
          await this.connect();
        }
      }

      if (connection === 'open') {
        this.qrString = null;
        this.logger.log('WhatsApp connected via Baileys ✅');
        this.eventEmitter.emit('baileys.connected');
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const from = msg.key.remoteJid;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          '';
        if (!from || !text) continue;
        this.eventEmitter.emit('baileys.message', { from, text, msg });
      }
    });
  }

  async sendText(to: string, message: string): Promise<void> {
    if (!this.sock) throw new Error('Baileys not connected');
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, { text: message });
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
    if (!this.sock) throw new Error('Baileys not connected');
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, {
      image: { url: imageUrl },
      caption: caption ?? '',
    });
  }
}

