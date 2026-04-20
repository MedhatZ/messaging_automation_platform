import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../jwt-access-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessPayload>(token);
      (request as Request & { user: JwtAccessPayload }).user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }

  private extractBearer(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header || typeof header !== 'string') return undefined;
    const [type, token] = header.split(/\s+/, 2);
    if (type !== 'Bearer' || !token) return undefined;
    return token;
  }
}
