import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  CheckResult,
  MeterType,
  MeterSource,
  OwnershipType,
  VehicleCategory,
  VehicleDocumentType,
  VehicleStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationDto } from '@/common/dto/pagination.dto';

export class CreateVehicleDto {
  @ApiProperty({ description: 'Гаражный номер — уникален в пределах офиса', example: 'А-142' })
  @IsString()
  @MaxLength(24)
  @Matches(/^[\wА-Яа-яЁё\-/]+$/u, { message: 'Недопустимые символы в гаражном номере' })
  garageNumber: string;

  @ApiPropertyOptional({ example: '01 A 123 BC' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  plateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  vin?: string;

  @ApiPropertyOptional({ description: 'Инвентарный номер в бухгалтерии' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  inventoryNumber?: string;

  @ApiProperty({ enum: VehicleCategory })
  @IsEnum(VehicleCategory)
  category: VehicleCategory;

  @ApiProperty({ description: 'Модель из справочника' })
  @IsInt()
  @IsPositive()
  modelId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  fuelTypeId?: number;

  @ApiPropertyOptional({ enum: MeterType, default: MeterType.ODOMETER })
  @IsOptional()
  @IsEnum(MeterType)
  meterType?: MeterType;

  @ApiPropertyOptional({ enum: OwnershipType, default: OwnershipType.OWNED })
  @IsOptional()
  @IsEnum(OwnershipType)
  ownership?: OwnershipType;

  @ApiPropertyOptional({ description: 'Ёмкость бака, л' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  tankCapacity?: number;

  @ApiPropertyOptional({ description: 'Показание одометра при постановке на учёт' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  currentOdometer?: number;

  @ApiPropertyOptional({ description: 'Показание счётчика моточасов при постановке на учёт' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  currentEngineHours?: number;

  @ApiPropertyOptional({ minimum: 1950, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  manufactureYear?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  commissionedAt?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Требуется ли водителю допуск на перрон для работы на этой технике',
  })
  @IsOptional()
  @IsBoolean()
  requiresAirsidePermit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * office_id в UpdateVehicleDto нет намеренно: перевод техники в другой офис —
 * это операция transfer(), которая ведёт историю приписки, а не правка поля.
 */
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {
  @ApiPropertyOptional({ enum: VehicleStatus })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}

export class TransferVehicleDto {
  @ApiProperty({ description: 'Офис, в который передаётся техника' })
  @IsInt()
  @IsPositive()
  targetOfficeId: number;

  @ApiProperty({ format: 'date', description: 'Дата вступления перевода в силу' })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional({ description: 'Основание: номер и дата приказа' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class VehicleDocumentDto {
  @ApiProperty({ enum: VehicleDocumentType })
  @IsEnum(VehicleDocumentType)
  type: VehicleDocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  number?: string;

  @ApiPropertyOptional({ description: 'Кем выдан' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Срок действия — попадает в дашборд' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Стоимость, для страховок' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

/**
 * Ручная корректировка показаний счётчика.
 * Отдельный тип операции, а не правка карточки: замена одометра должна
 * оставлять след, иначе расхождение в путевых листах невозможно объяснить.
 */
export class MeterAdjustmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometer?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  engineHours?: number;

  @ApiPropertyOptional({ enum: MeterSource, default: MeterSource.ADJUSTMENT })
  @IsOptional()
  @IsEnum(MeterSource)
  source?: MeterSource;

  @ApiProperty({ description: 'Основание корректировки' })
  @IsString()
  @MaxLength(300)
  comment: string;
}

export class VehicleQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: VehicleCategory })
  @IsOptional()
  @IsEnum(VehicleCategory)
  category?: VehicleCategory;

  @ApiPropertyOptional({ enum: VehicleStatus })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  modelId?: number;

  @ApiPropertyOptional({
    description: 'Только техника с истекающими документами (в ближайшие N дней)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiringWithinDays?: number;
}

/**
 * Заключение механика о техническом состоянии.
 *
 * Перечень узлов приходит объектом «ключ → отметка»: состав перечня задан
 * в общем пакете (TECHNICAL_CHECKLIST) и одинаков на сервере и в форме.
 */
export class TechnicalInspectionDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'По умолчанию — сейчас' })
  @IsOptional()
  @IsDateString()
  checkedAt?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'До какого момента действует. По умолчанию — 12 часов от осмотра.',
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({ enum: CheckResult })
  @IsEnum(CheckResult)
  result: CheckResult;

  @ApiPropertyOptional({ default: true, description: 'Предрейсовый, а не периодический' })
  @IsOptional()
  @IsBoolean()
  isPreTrip?: boolean;

  @ApiPropertyOptional({ description: 'Отметки по узлам: {"brakes": true, ...}' })
  @IsOptional()
  @IsObject()
  checklist?: Record<string, boolean>;

  @ApiPropertyOptional({ description: 'Показание одометра на момент осмотра' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometer?: number;

  @ApiPropertyOptional({ description: 'ФИО механика для записей, перенесённых с бумаги' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mechanicName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;
}