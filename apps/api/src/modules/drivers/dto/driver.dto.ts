import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CheckResult, LicenseCategory, PermitZone } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationDto } from '@/common/dto/pagination.dto';

export class CreateDriverDto {
  @ApiProperty({ description: 'Табельный номер — уникален в пределах офиса' })
  @IsString()
  @MaxLength(24)
  personnelNumber: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  lastName: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  middleName?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  departmentId?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @ApiPropertyOptional({ format: 'date', description: 'Дата увольнения' })
  @IsOptional()
  @IsDateString()
  dismissDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DriverLicenseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  number: string;

  @ApiProperty({ enum: LicenseCategory, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(LicenseCategory, { each: true })
  categories: LicenseCategory[];

  @ApiProperty({ format: 'date' })
  @IsDateString()
  issuedAt: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  expiresAt: string;
}

export class DriverPermitDto {
  @ApiProperty({ enum: PermitZone, description: 'Зона допуска' })
  @IsEnum(PermitZone)
  zone: PermitZone;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  number: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  issuedAt: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  expiresAt: string;
}

export class MedicalCheckDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  checkedAt: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Для периодического осмотра. У предрейсового не заполняется.',
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({ enum: CheckResult })
  @IsEnum(CheckResult)
  result: CheckResult;

  @ApiPropertyOptional({ default: false, description: 'Предрейсовый осмотр' })
  @IsOptional()
  @IsBoolean()
  isPreTrip?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  doctorName?: string;

  @ApiPropertyOptional({ example: '120/80' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  bloodPressure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(30)
  @Max(45)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Промилле по алкотестеру' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10)
  alcoholPpm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class DriverQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  departmentId?: number;
}
