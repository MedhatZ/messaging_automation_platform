import { ServiceUnavailableException } from '@nestjs/common';

export class QueueUnavailableException extends ServiceUnavailableException {
  constructor(message = 'Queue unavailable (degraded mode)') {
    super(message);
  }
}

