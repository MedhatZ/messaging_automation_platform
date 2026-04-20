import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  WHATSAPP_JOB_IMAGE,
  WHATSAPP_JOB_TEXT,
  WHATSAPP_SEND_QUEUE,
} from './whatsapp-send.constants';
import type {
  WhatsappSendImageJobData,
  WhatsappSendJobStatus,
  WhatsappSendTextJobData,
} from './whatsapp-send.types';

export type { WhatsappSendJobStatus } from './whatsapp-send.types';

@Injectable()
export class WhatsappSendProducer {
  private readonly logger = new Logger(WhatsappSendProducer.name);

  constructor(
    @InjectQueue(WHATSAPP_SEND_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueueText(data: WhatsappSendTextJobData): Promise<string> {
    const job = await this.queue.add(WHATSAPP_JOB_TEXT, data);
    const id = String(job.id);
    this.logger.debug(`Enqueued WhatsApp text job id=${id} to=${data.to}`);
    return id;
  }

  async enqueueImage(data: WhatsappSendImageJobData): Promise<string> {
    const job = await this.queue.add(WHATSAPP_JOB_IMAGE, data);
    const id = String(job.id);
    this.logger.debug(`Enqueued WhatsApp image job id=${id} to=${data.to}`);
    return id;
  }

  /**
   * Reads persisted job metadata from Redis (BullMQ). Returns null if the job id is unknown or expired.
   */
  async getJobStatus(jobId: string): Promise<WhatsappSendJobStatus | null> {
    const job = await this.queue.getJob(jobId);
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
