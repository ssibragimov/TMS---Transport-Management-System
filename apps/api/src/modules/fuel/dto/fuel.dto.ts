import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FuelSource, NormAdjustmentKind, NormType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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
  ValidateIf,
} from 'class-validator';

import { PaginationDto } from '@/common/dto/pagination.dto';

export class CreateFuelReceiptDto {
  @ApiProperty({ description: 'Ёмкость, в которую приходуется топливо' })
  @IsInt()
  @IsPositive()
  tankId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  supplierId?: number;

  @ApiPropertyOptional({ description: 'Номер накладной поставщика' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalNumber?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  receivedAt: string;

  @ApiProperty({ description: 'Объём, л' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  volume: number;

  @ApiPropertyOptional({ description: 'Плотность по паспорту качества, кг/л' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.5)
  @Max(1.2)
  density?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  pricePerLitre?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  fileKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class CreateFuelIssueDto {
  @ApiProperty()
  @IsInt()
  @IsPositive()
  vehicleId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  driverId?: number;

  @ApiPropertyOptional({ description: 'Путевой лист, в счёт которого выдаётся топливо' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  waybillId?: number;

  @ApiProperty({ enum: FuelSource, default: FuelSource.TANK })
  @IsEnum(FuelSource)
  source: FuelSource;

  @ApiPropertyOptional({ description: 'Обязателен при source = TANK' })
  @ValidateIf((o: CreateFuelIssueDto) => o.source === FuelSource.TANK)
  @IsInt()
  @IsPositive()
  tankId?: number;

  @ApiPropertyOptional({ description: 'Обязателен при source = FUEL_CARD' })
  @ValidateIf((o: CreateFuelIssueDto) => o.source === FuelSource.FUEL_CARD)
  @IsInt()
  @IsPositive()
  fuelCardId?: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  issuedAt: string;

  @ApiProperty({ description: 'Объём, л' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000)
  volume: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  pricePerLitre?: number;

  @ApiPropertyOptional({ description: 'Одометр в момент заправки' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerAtIssue?: number;

  @ApiPropertyOptional({ description: 'Моточасы в момент заправки' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  engineHoursAtIssue?: number;

  @ApiPropertyOptional({ description: 'АЗС или место заправки' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class FuelIssueQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  vehicleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  tankId?: number;

  @ApiPropertyOptional({ enum: FuelSource })
  @IsOptional()
  @IsEnum(FuelSource)
  source?: FuelSource;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class CreateFuelNormDto {
  @ApiPropertyOptional({ description: 'Норма конкретной единицы техники' })
  @ValidateIf((o: CreateFuelNormDto) => !o.modelId)
  @IsInt()
  @IsPositive()
  vehicleId?: number;

  @ApiPropertyOptional({ description: 'Норма модели. Указывается ровно одно из двух полей.' })
  @ValidateIf((o: CreateFuelNormDto) => !o.vehicleId)
  @IsInt()
  @IsPositive()
  modelId?: number;

  @ApiProperty({ enum: NormType })
  @IsEnum(NormType)
  normType: NormType;

  @ApiProperty({ description: 'Л/100 км, л/моточас, л/операцию, л/смену или л/т·км' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10_000)
  baseRate: number;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional({ description: 'Основание: номер и дата приказа' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  documentRef?: string;
}

export class CreateNormAdjustmentDto {
  @ApiProperty({ enum: NormAdjustmentKind })
  @IsEnum(NormAdjustmentKind)
  kind: NormAdjustmentKind;

  @ApiPropertyOptional({ description: 'Процент к базе. Взаимоисключающе с absolutePerUnit.' })
  @ValidateIf((o: CreateNormAdjustmentDto) => o.absolutePerUnit === undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(500)
  percent?: number;

  @ApiPropertyOptional({ description: 'Абсолютная надбавка на единицу объёма работы' })
  @ValidateIf((o: CreateNormAdjustmentDto) => o.percent === undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  absolutePerUnit?: number;

  @ApiPropertyOptional({ enum: NormType, description: 'К какой базе применяется' })
  @IsOptional()
  @IsEnum(NormType)
  appliesTo?: NormType;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  seasonFromMonth?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  seasonToMonth?: number;
}
