import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  StockCategory,
  StockDocumentKind,
  StockIssuePurpose,
  StockMovementType,
  StockTracking,
  WarehouseKind,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '@/common/dto/pagination.dto';

// ─── Номенклатура и склады ───────────────────────────────────────────────────

export class CreateStockItemDto {
  @ApiProperty({ description: 'Код позиции, уникален на всю страну' })
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  name: string;

  @ApiProperty({ description: 'Единица измерения: шт, л, кг, компл' })
  @IsString()
  @MaxLength(16)
  unit: string;

  @ApiProperty({ enum: StockCategory })
  @IsEnum(StockCategory)
  category: StockCategory;

  @ApiPropertyOptional({ enum: StockTracking, default: StockTracking.QUANTITY })
  @IsOptional()
  @IsEnum(StockTracking)
  tracking?: StockTracking;

  @ApiPropertyOptional({ description: 'Каталожный номер производителя' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  catalogNumber?: string;

  @ApiPropertyOptional({ description: 'Выдаётся только в обмен на сданное отработанное' })
  @IsOptional()
  @IsBoolean()
  exchangeRequired?: boolean;
}

export class UpdateStockItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiPropertyOptional({ enum: StockCategory })
  @IsOptional()
  @IsEnum(StockCategory)
  category?: StockCategory;

  @ApiPropertyOptional({ enum: StockTracking })
  @IsOptional()
  @IsEnum(StockTracking)
  tracking?: StockTracking;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  catalogNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  exchangeRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWarehouseDto {
  @ApiProperty({ description: 'Код склада в пределах офиса' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiProperty({ enum: WarehouseKind, default: WarehouseKind.MAIN })
  @IsEnum(WarehouseKind)
  kind: WarehouseKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  location?: string;

  @ApiPropertyOptional({ description: 'Материально ответственный кладовщик' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  keeperUserId?: number;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  keeperUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Неснижаемый запас задаётся по складу, а не по номенклатуре: в кладовой
 *  при гараже держат две канистры масла, на основном складе — бочку. */
export class SetMinQuantityDto {
  @ApiProperty()
  @IsInt()
  @IsPositive()
  warehouseId: number;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  partId: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1_000_000)
  minQuantity: number;
}

// ─── Строки документов ───────────────────────────────────────────────────────

export class StockLineDto {
  @ApiProperty({ description: 'Позиция номенклатуры' })
  @IsInt()
  @IsPositive()
  partId: number;

  @ApiProperty({ description: 'Количество, всегда положительное' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1_000_000)
  quantity: number;

  @ApiPropertyOptional({ description: 'Цена за единицу. Для прихода пересчитывает среднюю.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({
    description:
      'Принять отработанное на склад утилизации (обмен «старое на новое»)',
  })
  @IsOptional()
  @IsBoolean()
  returnsOld?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

class DocumentBaseDto {
  @ApiProperty({ description: 'Склад, по которому проводится документ' })
  @IsInt()
  @IsPositive()
  warehouseId: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  documentDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @ApiProperty({ type: [StockLineDto] })
  @ValidateNested({ each: true })
  @Type(() => StockLineDto)
  @ArrayMinSize(1)
  // Больше сотни строк в одном требовании-накладной не бывает: это уже
  // не документ, а выгрузка. Ограничение защищает от случайной отправки
  // всего справочника одним запросом.
  @ArrayMaxSize(100)
  lines: StockLineDto[];
}

export class CreateStockReceiptDto extends DocumentBaseDto {
  @ApiPropertyOptional({ description: 'Поставщик' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  supplierId?: number;

  @ApiPropertyOptional({ description: 'Номер накладной поставщика' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalNumber?: string;
}

export class CreateStockIssueDto extends DocumentBaseDto {
  @ApiPropertyOptional({ description: 'На какую технику выданы ценности' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  vehicleId?: number;

  @ApiPropertyOptional({ description: 'Получатель-водитель' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  recipientDriverId?: number;

  @ApiPropertyOptional({ description: 'Получатель-сотрудник (механик, мастер)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  recipientUserId?: number;

  @ApiPropertyOptional({ description: 'Наряд-заказ, в счёт которого идёт выдача' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  workOrderId?: number;

  @ApiProperty({ enum: StockIssuePurpose })
  @IsEnum(StockIssuePurpose)
  purpose: StockIssuePurpose;

  @ApiPropertyOptional({ description: 'Причина внеплановой выдачи' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}

export class CreateStockReturnDto extends DocumentBaseDto {
  @ApiPropertyOptional({ description: 'Кто возвращает — водитель' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  recipientDriverId?: number;

  @ApiPropertyOptional({ description: 'Кто возвращает — сотрудник' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  recipientUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  vehicleId?: number;
}

export class CreateStockWriteOffDto extends DocumentBaseDto {
  @ApiProperty({ description: 'Основание списания. Обязательно и осмысленно.' })
  @IsString()
  @MinLength(5)
  @MaxLength(400)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  vehicleId?: number;
}

export class CreateStockTransferDto extends DocumentBaseDto {
  @ApiProperty({ description: 'Склад-приёмник' })
  @IsInt()
  @IsPositive()
  targetWarehouseId: number;
}

// ─── Запросы ─────────────────────────────────────────────────────────────────

export class StockBalanceQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId?: number;

  @ApiPropertyOptional({ enum: StockCategory })
  @IsOptional()
  @IsEnum(StockCategory)
  category?: StockCategory;

  @ApiPropertyOptional({ description: 'Только позиции ниже неснижаемого запаса' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  belowMin?: boolean;

  @ApiPropertyOptional({ description: 'Скрыть позиции с нулевым остатком' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  inStockOnly?: boolean;
}

export class StockMovementQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  partId?: number;

  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class StockDocumentQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: StockDocumentKind })
  @IsOptional()
  @IsEnum(StockDocumentKind)
  kind?: StockDocumentKind;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  vehicleId?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class TurnoverQueryDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  dateFrom: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  dateTo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId?: number;
}
