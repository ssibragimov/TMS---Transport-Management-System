import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
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

export class ViolationDto {
  @ApiProperty({ description: 'Водитель, допустивший нарушение' })
  @IsInt()
  @IsPositive()
  driverId: number;

  @ApiPropertyOptional({ description: 'Техника, на которой остановили водителя' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  vehicleId?: number;

  @ApiProperty({ description: 'Вид нарушения из справочника' })
  @IsInt()
  @IsPositive()
  typeId: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  occurredAt: string;

  @ApiPropertyOptional({ description: 'Сумма штрафа' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  fineAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;
}

export class ViolationQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  driverId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  vehicleId?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
