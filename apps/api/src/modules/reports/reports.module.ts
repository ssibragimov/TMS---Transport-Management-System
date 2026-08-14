import { Controller, Get, Module, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditAction, VehicleCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import type { Response } from 'express';
import { PERMISSIONS } from '@gsm/shared';

import { AuditAs, Audited } from '@/common/audit/audit.interceptor';
import { CurrentOffice, RequirePermissions } from '@/common/decorators';
import { DriversModule } from '@/modules/drivers/drivers.module';
import { DriversService } from '@/modules/drivers/drivers.service';
import { VehiclesModule } from '@/modules/vehicles/vehicles.module';
import { VehiclesService } from '@/modules/vehicles/vehicles.service';

import { csvFileName, toCsv, type CsvColumn } from './csv';
import {
  ReportsService,
  type DriverActivityRow,
  type FuelConsumptionRow,
  type FuelMovementRow,
} from './reports.service';

class ReportQueryDto {
  @IsDateString()
  dateFrom: string;

  @IsDateString()
  dateTo: string;

  @IsOptional()
  @IsEnum(VehicleCategory)
  category?: VehicleCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  departmentId?: number;
}

const CONSUMPTION_COLUMNS: CsvColumn<FuelConsumptionRow>[] = [
  { key: 'garageNumber', title: 'Гаражный номер' },
  { key: 'plateNumber', title: 'Госномер' },
  { key: 'model', title: 'Модель' },
  { key: 'category', title: 'Категория' },
  { key: 'waybills', title: 'Путевых листов' },
  { key: 'distanceKm', title: 'Пробег, км' },
  { key: 'engineHours', title: 'Моточасы' },
  { key: 'normLitres', title: 'Норма, л' },
  { key: 'actualLitres', title: 'Факт, л' },
  { key: 'deviationLitres', title: 'Отклонение, л' },
  { key: 'deviationPct', title: 'Отклонение, %' },
  { key: 'litresPer100Km', title: 'л/100 км' },
  { key: 'litresPerHour', title: 'л/моточас' },
  { key: 'issuedLitres', title: 'Заправлено, л' },
  { key: 'fuelCost', title: 'Стоимость топлива' },
];

const DRIVER_COLUMNS: CsvColumn<DriverActivityRow>[] = [
  { key: 'personnelNumber', title: 'Табельный номер' },
  { key: 'driver', title: 'Водитель' },
  { key: 'shifts', title: 'Смен' },
  { key: 'distanceKm', title: 'Пробег, км' },
  { key: 'engineHours', title: 'Моточасы' },
  { key: 'normLitres', title: 'Норма, л' },
  { key: 'actualLitres', title: 'Факт, л' },
  { key: 'deviationPct', title: 'Отклонение, %' },
];

const MOVEMENT_COLUMNS: CsvColumn<FuelMovementRow>[] = [
  { key: 'code', title: 'Ёмкость' },
  { key: 'name', title: 'Наименование' },
  { key: 'fuelType', title: 'Вид топлива' },
  { key: 'capacity', title: 'Объём, л' },
  { key: 'openingVolume', title: 'Остаток на начало, л' },
  { key: 'receivedLitres', title: 'Приход, л' },
  { key: 'issuedLitres', title: 'Расход, л' },
  { key: 'closingVolume', title: 'Остаток на конец, л' },
  { key: 'receivedAmount', title: 'Сумма прихода' },
  { key: 'issuedAmount', title: 'Сумма расхода' },
];

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly drivers: DriversService,
    private readonly vehicles: VehiclesService,
  ) {}

  private period(query: ReportQueryDto): { dateFrom: Date; dateTo: Date } {
    const dateFrom = new Date(query.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(query.dateTo);
    // Верхняя граница включительно: пользователь, выбравший «по 31 число»,
    // ожидает увидеть смены этого дня, а не до его начала.
    dateTo.setHours(23, 59, 59, 999);
    return { dateFrom, dateTo };
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Сводка по офису за период' })
  summary(@CurrentOffice() officeId: number, @Query() query: ReportQueryDto) {
    return this.reports.summary(officeId, this.period(query));
  }

  @Get('fuel-consumption')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Расход топлива по единицам техники' })
  fuelConsumption(@CurrentOffice() officeId: number, @Query() query: ReportQueryDto) {
    return this.reports.fuelConsumption(officeId, this.period(query), {
      category: query.category,
      departmentId: query.departmentId,
    });
  }

  @Get('driver-activity')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Наработка и расход по водителям' })
  driverActivity(@CurrentOffice() officeId: number, @Query() query: ReportQueryDto) {
    return this.reports.driverActivity(officeId, this.period(query));
  }

  @Get('fuel-movement')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Движение топлива по ёмкостям' })
  fuelMovement(@CurrentOffice() officeId: number, @Query() query: ReportQueryDto) {
    return this.reports.fuelMovement(officeId, this.period(query));
  }

  /**
   * Единый дашборд истекающих сроков: документы техники и допуски водителей
   * в одном списке. Разделять их бессмысленно — недопуск к рейсу одинаково
   * останавливает работу в обоих случаях.
   */
  @Get('expiring')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOperation({ summary: 'Все истекающие документы офиса' })
  async expiring(@CurrentOffice() officeId: number, @Query('days') days?: string) {
    const withinDays = days ? Number(days) : 30;
    const [drivers, vehicles] = await Promise.all([
      this.drivers.expiringClearances(officeId, withinDays),
      this.vehicles.expiringDocuments(officeId, withinDays),
    ]);
    return [...drivers, ...vehicles].sort((a, b) => a.daysLeft - b.daysLeft);
  }

  // ─── Выгрузка ────────────────────────────────────────────────────────────

  @Get('fuel-consumption.csv')
  @Audited('Report')
  @AuditAs(AuditAction.EXPORT)
  @RequirePermissions(PERMISSIONS.REPORT_EXPORT)
  @ApiOperation({ summary: 'Выгрузка расхода топлива в CSV' })
  async exportConsumption(
    @CurrentOffice() officeId: number,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const period = this.period(query);
    const rows = await this.reports.fuelConsumption(officeId, period, {
      category: query.category,
      departmentId: query.departmentId,
    });
    this.sendCsv(res, toCsv(rows, CONSUMPTION_COLUMNS), csvFileName('rashod-gsm', period.dateFrom, period.dateTo));
  }

  @Get('driver-activity.csv')
  @Audited('Report')
  @AuditAs(AuditAction.EXPORT)
  @RequirePermissions(PERMISSIONS.REPORT_EXPORT)
  @ApiOperation({ summary: 'Выгрузка наработки водителей в CSV' })
  async exportDrivers(
    @CurrentOffice() officeId: number,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const period = this.period(query);
    const rows = await this.reports.driverActivity(officeId, period);
    this.sendCsv(res, toCsv(rows, DRIVER_COLUMNS), csvFileName('voditeli', period.dateFrom, period.dateTo));
  }

  @Get('fuel-movement.csv')
  @Audited('Report')
  @AuditAs(AuditAction.EXPORT)
  @RequirePermissions(PERMISSIONS.REPORT_EXPORT)
  @ApiOperation({ summary: 'Выгрузка движения топлива в CSV' })
  async exportMovement(
    @CurrentOffice() officeId: number,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const period = this.period(query);
    const rows = await this.reports.fuelMovement(officeId, period);
    this.sendCsv(res, toCsv(rows, MOVEMENT_COLUMNS), csvFileName('dvizhenie-gsm', period.dateFrom, period.dateTo));
  }

  private sendCsv(res: Response, body: string, fileName: string): void {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // Иначе браузер не увидит имя файла: заголовок не входит в список
    // разрешённых по умолчанию при запросе с другого origin.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(body);
  }
}

@Module({
  // Дашборд истекающих сроков собирается из двух модулей: сроки документов
  // техники живут в VehiclesService, допуски водителей — в DriversService.
  // Дублировать выборки здесь означало бы иметь два расходящихся определения
  // того, что считается «истекающим».
  imports: [DriversModule, VehiclesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
