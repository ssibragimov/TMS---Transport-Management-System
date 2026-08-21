import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleCondition, WaybillStatus, WaybillType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '@/common/dto/pagination.dto';

export class WaybillTaskDto {
  @ApiProperty({ description: 'Порядковый номер задания в путевом листе' })
  @IsInt()
  @Min(1)
  @Max(200)
  sequence: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  fromPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  toPoint?: string;

  @ApiPropertyOptional({ example: 'HY603', description: 'Номер обслуживаемого рейса' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  flightNumber?: string;

  @ApiPropertyOptional({ example: 'UK78701', description: 'Бортовой номер ВС' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  aircraftReg?: string;

  @ApiPropertyOptional({ description: 'Номер стоянки' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  standNumber?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  distanceKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  engineHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  cargoTons?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  passengers?: number;

  @ApiPropertyOptional({ description: 'Число операций — база для нормы «л/операцию»' })
  @IsOptional()
  @IsInt()
  @Min(0)
  operations?: number;
}

export class CreateWaybillDto {
  @ApiProperty({ enum: WaybillType, default: WaybillType.SHIFT })
  @IsEnum(WaybillType)
  type: WaybillType;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  vehicleId: number;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  driverId: number;

  @ApiPropertyOptional({ description: 'Сменщик' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  coDriverId?: number;

  @ApiProperty({ format: 'date-time', description: 'Начало смены или периода' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ format: 'date-time', description: 'Окончание смены или периода' })
  @IsDateString()
  validTo: string;

  @ApiPropertyOptional({
    description: 'Показание одометра на выезд. По умолчанию — текущее из карточки техники.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerStart?: number;

  @ApiPropertyOptional({ description: 'Показание счётчика моточасов на выезд' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  engineHoursStart?: number;

  @ApiPropertyOptional({ type: [WaybillTaskDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaybillTaskDto)
  tasks?: WaybillTaskDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class IssueWaybillDto {
  /*
   * Признака «медосмотр пройден» здесь намеренно нет.
   *
   * Он был булевым полем, которое диспетчер ставил себе сам, — то есть
   * заинтересованная сторона подтверждала собственную проверку. Теперь
   * основанием служит заключение врача из здравпункта, и сервер берёт его
   * из базы, а не со слов вызывающего.
   */

  /*
   * Признака «техосмотр пройден» здесь тоже нет — по той же причине,
   * что и медицинского: исправность подтверждает механик своим заключением,
   * а не диспетчер галочкой в форме выдачи.
   */

  @ApiPropertyOptional({
    description:
      'Причина выпуска без действующего заключения механика. ' +
      'Требует права waybill.override_technical. Отказ механика этим не снимается.',
    maxLength: 400,
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  technicalOverrideReason?: string;

  @ApiPropertyOptional({ description: 'Чек-лист осмотра из мобильного приложения' })
  @IsOptional()
  preTripChecklist?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Выдать вопреки предупреждениям о просроченных документах водителя. ' +
      'Требует права waybill.issue и фиксируется в журнале аудита. ' +
      'На медицинский допуск не распространяется.',
  })
  @IsOptional()
  @IsBoolean()
  overrideEligibility?: boolean;

  @ApiPropertyOptional({
    description:
      'Причина выдачи без действующего предрейсового медосмотра. ' +
      'Требует отдельного права waybill.override_medical. ' +
      'Отказ врача этим не снимается ни при каких правах.',
    maxLength: 400,
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  medicalOverrideReason?: string;

  @ApiPropertyOptional({
    enum: VehicleCondition,
    default: VehicleCondition.SERVICEABLE,
    description: 'Состояние техники при выдаче — точка отсчёта для акта при возврате',
  })
  @IsOptional()
  @IsEnum(VehicleCondition)
  conditionOnIssue?: VehicleCondition;

  @ApiPropertyOptional({ description: 'Замечания к состоянию при выдаче' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  conditionIssueNotes?: string;
}

export class SubmitWaybillDto {
  @ApiPropertyOptional({ description: 'Показание одометра на возврат' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerEnd?: number;

  @ApiPropertyOptional({ description: 'Показание счётчика моточасов на возврат' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  engineHoursEnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CloseWaybillDto {
  @ApiPropertyOptional({ description: 'Показание одометра на возврат' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometerEnd?: number;

  @ApiPropertyOptional({ description: 'Показание счётчика моточасов на возврат' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  engineHoursEnd?: number;

  @ApiPropertyOptional({
    description:
      'Фактический остаток в баке на конец смены, л. Если указан — расход ' +
      'считается по остатку, иначе принимается равным нормативному.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fuelClosing?: number;

  @ApiPropertyOptional({ type: [WaybillTaskDto], description: 'Итоговые задания' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaybillTaskDto)
  tasks?: WaybillTaskDto[];

  @ApiPropertyOptional({
    enum: VehicleCondition,
    description:
      'Состояние техники при возврате. Если хуже, чем при выдаче, ' +
      'автоматически составляется акт с указанием водителя.',
  })
  @IsOptional()
  @IsEnum(VehicleCondition)
  conditionOnReturn?: VehicleCondition;

  @ApiPropertyOptional({ description: 'Описание повреждений — попадёт в акт' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  conditionReturnNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CancelWaybillDto {
  @ApiProperty()
  @IsString()
  @MaxLength(400)
  reason: string;
}

export class WaybillQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: WaybillStatus })
  @IsOptional()
  @IsEnum(WaybillStatus)
  status?: WaybillStatus;

  @ApiPropertyOptional({ enum: WaybillType })
  @IsOptional()
  @IsEnum(WaybillType)
  type?: WaybillType;

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
  driverId?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Только листы с перерасходом свыше указанного процента',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  deviationOver?: number;
}
