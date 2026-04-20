import type { JwtAccessPayload } from '../auth/jwt-access-payload.interface';

declare global {
  namespace Express {
    interface Request {
      user?: JwtAccessPayload;
    }
  }
}

export {};
