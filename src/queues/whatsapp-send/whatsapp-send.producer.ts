import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  WHATSAPP_JOB_IMAGE,
  WHATSAPP_JOB_INTERACTIVE_BUTTONS,
  WHATSAPP_JOB_PRODUCT_LIST,
  WHATSAPP_JOB_TEXT,
  WHATSAPP_JOB_VIDEO,
  WHATSAPP_SEND_QUEUE,
} from './whatsapp-send.constants';
import { QueueUnavailableException } from '../../common/exceptions/queue-unavailable.exception';
import type {
  WhatsappSendImageJobData,
  WhatsappSendInteractiveButtonsJobData,
  WhatsappSendJobStatus,
  WhatsappSendProductListJobData,
  WhatsappSendTextJobData,
  WhatsappSendVideoJobData,
} from './whatsapp-send.types';

export type { WhatsappSendJobStatus } from './whatsapp-send.types';

@Injectable()
export class WhatsappSendProducer {
  private readonly logger = new Logger(WhatsappSendProducer.name);

  constructor(
    @Optional()
    @InjectQueue(WHATSAPP_SEND_QUEUE)
    private readonly queue?: Queue,
  ) {}

  private getQueueOrThrow(): Queue {
    const q = this.queue;
    if (process.env.QUEUES_DISABLED === 'true' || !q) {
      this.logger.error(
        'Queues are disabled (Redis unavailable) - refusing to enqueue job',
      );
      throw new QueueUnavailableException();
    }
    return q;
  }

  async enqueueText(
    data: WhatsappSendTextJobData,
    opts?: { delayMs?: number },
  ): Promise<string> {
    const queue = this.getQueueOrThrow();
    const job = await queue.add(WHATSAPP_JOB_TEXT, data, {
      ...(opts?.delayMs != null ? { delay: Math.max(0, opts.delayMs) } : {}),
    });
    const id = String(job.id);
    this.logger.debug(`Enqueued WhatsApp text job id=${id} to=${data.to}`);
    return id;
  }

  async enqueueImage(data: WhatsappSendImageJobData): Promise<string> {
    const queue = this.getQueueOrThrow();
    const job = await queue.add(WHATSAPP_JOB_IMAGE, data);
    const id = String(job.id);
    this.logger.debug(`Enqueued WhatsApp image job id=${id} to=${data.to}`);
    return id;
  }

  async enqueueVideo(data: WhatsappSendVideoJobData): Promise<string> {
    const queue = this.getQueueOrThrow();
    const job = await queue.add(WHATSAPP_JOB_VIDEO, data);
    const id = String(job.id);
    this.logger.debug(`Enqueued WhatsApp video job id=${id} to=${data.to}`);
    return id;
  }

  async enqueueInteractiveButtons(
    data: WhatsappSendInteractiveButtonsJobData,
    opts?: { delayMs?: number },
  ): Promise<string> {
    const queue = this.getQueueOrThrow();
    const job = await queue.add(WHATSAPP_JOB_INTERACTIVE_BUTTONS, data, {
      ...(opts?.delayMs != null ? { delay: Math.max(0, opts.delayMs) } : {}),
    });
    const id = String(job.id);
    this.logger.debug(
      `Enqueued WhatsApp interactive_buttons job id=${id} to=${data.to} buttons=${data.buttons.length}`,
    );
    return id;
  }

  async enqueueProductList(data: WhatsappSendProductListJobData): Promise<string> {
    const queue = this.getQueueOrThrow();
    const job = await queue.add(WHATSAPP_JOB_PRODUCT_LIST, data);
    const id = String(job.id);
    this.logger.debug(
      `Enqueued WhatsApp product_list job id=${id} to=${data.to} items=${data.productRetailerIds.length}`,
    );
    return id;
  }

  /**
   * Reads persisted job metadata from Redis (BullMQ). Returns null if the job id is unknown or expired.
   */
  async getJobStatus(jobId: string): Promise<WhatsappSendJobStatus | null> {
    const queue = this.getQueueOrThrow();
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      id: String(job.id),
      name: job.name,
      state,
      attemptsMade: job.attemptsMade ?? 0,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason ?? '',
      returnvalue: job.returnvalue,
    };
  }
}
