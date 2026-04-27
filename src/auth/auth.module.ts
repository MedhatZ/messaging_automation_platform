import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClientTenantGuard } from './guards/client-tenant.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.getOrThrow<number>('jwt.expiresInSeconds'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, Reflector, JwtAuthGuard, RolesGuard, ClientTenantGuard],
  exports: [
    AuthService,
    JwtModule,
    Reflector,
    JwtAuthGuard,
    RolesGuard,
    ClientTenantGuard,
  ],
})
export class AuthModule {}
