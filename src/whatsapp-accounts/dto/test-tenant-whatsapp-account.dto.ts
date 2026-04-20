import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** WhatsApp ID in international format (digits, optional leading +). */
export class TestTenantWhatsappAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'to must be a valid WhatsApp phone number (E.164 style, e.g. +15551234567)',
  })
  to: string;
}
