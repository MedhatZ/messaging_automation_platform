import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsEnum(['development', 'production', 'test', 'staging'])
  NODE_ENV?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  APP_NAME?: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false, protocols: ['postgres', 'postgresql'] })
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  META_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  DEFAULT_VERIFY_TOKEN?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_TOKEN_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_TEST_TO?: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100_000)
  RATE_LIMIT_WEBHOOK_PER_MINUTE?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500_000)
  RATE_LIMIT_OUTBOUND_PER_MINUTE?: number;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_MODEL?: string;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(60_000)
  OPENAI_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsOptional()
  @IsString()
  ANTHROPIC_MODEL?: string;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(60_000)
  ANTHROPIC_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  WHATSAPP_CATALOG_ID?: string;

  @IsOptional()
  @IsEnum(['true', 'false'])
  BAILEYS_ENABLED?: string;

  /**
   * Filesystem directory for Baileys multi-file auth state.
   * On platforms with ephemeral disk (e.g. Render), point this at a writable
   * persistent path such as `/tmp/baileys_auth`.
   */
  @IsOptional()
  @IsString()
  BAILEYS_AUTH_DIR?: string;

  /**
   * Public URL of the dashboard where the shop page is hosted.
   * Used by Baileys to send the shop link to customers.
   */
  @IsOptional()
  @IsString()
  APP_URL?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation error: ${messages}`);
  }
  return validated;
}
