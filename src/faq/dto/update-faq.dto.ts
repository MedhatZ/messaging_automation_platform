import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  questionAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  questionEn?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  answerAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  answerEn?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsAr?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsEn?: string[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;
}
