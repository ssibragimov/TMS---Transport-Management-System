import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { PERMISSIONS } from '@gsm/shared';

import { AuditAs, Audited } from '@/common/audit/audit.interceptor';
import { CurrentOffice, RequirePermissions } from '@/common/decorators';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { DriversModule } from '@/modules/drivers/drivers.module';
import { FuelModule } from '@/modules/fuel/fuel.module';
import { VehiclesModule } from '@/modules/vehicles/vehicles.module';

import {
  CancelWaybillDto,
  CloseWaybillDto,
  CreateWaybillDto,
  IssueWaybillDto,
  SubmitWaybillDto,
  WaybillQueryDto,
} from './dto/waybill.dto';
import { WaybillsService } from './waybills.service';

@ApiTags('waybills')
@Audited('Waybill')
@Controller('waybills')
export class WaybillsController {
  constructor(private readonly waybills: WaybillsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.WAYBILL_READ)
  @ApiOperation({ summary: 'Журнал путевых листов' })
  list(@CurrentOffice() officeId: number, @Query() query: WaybillQueryDto) {
    return this.waybills.list(officeId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.WAYBILL_READ)
  @ApiOperation({ summary: 'Путевой лист с заданиями и заправками' })
  findOne(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.waybills.findOne(officeId, id);
  }

  @Get(':id/print')
  @RequirePermissions(PERMISSIONS.WAYBILL_PRINT)
  @ApiOperation({ summary: 'Данные для печатной формы' })
  print(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.waybills.printData(officeId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.WAYBILL_CREATE)
  @ApiOperation({ summary: 'Создание путевого листа (черновик)' })
  create(@CurrentOffice() officeId: number, @Body() dto: CreateWaybillDto) {
    return this.waybills.create(officeId, dto);
  }

  @Post(':id/issue')
  @AuditAs(AuditAction.UPDATE)
  @RequirePermissions(PERMISSIONS.WAYBILL_ISSUE)
  @ApiOperation({
    summary: 'Выдача водителю',
    description:
      'Проверяет права, допуск на перрон и медосмотр. При наличии замечаний ' +
      'выдача блокируется; обойти можно только флагом overrideEligibility, ' +
      'который попадает в журнал аудита.',
  })
  issue(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueWaybillDto,
  ) {
    return this.waybills.issue(officeId, id, dto);
  }

  @Post(':id/submit')
  @AuditAs(AuditAction.UPDATE)
  @RequirePermissions(PERMISSIONS.WAYBILL_UPDATE)
  @ApiOperation({
    summary: 'Сдача путевого листа водителем',
    description:
      'Промежуточный шаг между выдачей и закрытием: фиксируются показания ' +
      'счётчиков на возврат, расчёт расхода выполняется позже при закрытии.',
  })
  submit(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitWaybillDto,
  ) {
    return this.waybills.submit(officeId, id, dto);
  }

  // Закрытие — утверждение расчёта, а не создание записи.
  @Post(':id/close')
  @AuditAs(AuditAction.APPROVE)
  @RequirePermissions(PERMISSIONS.WAYBILL_CLOSE)
  @ApiOperation({
    summary: 'Закрытие с расчётом расхода и отклонения от нормы',
  })
  close(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseWaybillDto,
  ) {
    return this.waybills.close(officeId, id, dto);
  }

  @Post(':id/cancel')
  @AuditAs(AuditAction.REJECT)
  @RequirePermissions(PERMISSIONS.WAYBILL_CANCEL)
  @ApiOperation({ summary: 'Аннулирование путевого листа' })
  cancel(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelWaybillDto,
  ) {
    return this.waybills.cancel(officeId, id, dto.reason);
  }
}

/**
 * Акты о состоянии техники.
 *
 * Только чтение: акт создаётся системой при закрытии путевого листа, когда
 * машину вернули хуже, чем выдали. Заводить его руками нельзя — иначе он
 * перестанет быть следствием факта и станет ещё одной формой отчётности.
 */
@ApiTags('waybills')
@Controller('condition-acts')
export class ConditionActsController {
  constructor(private readonly waybills: WaybillsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.WAYBILL_READ)
  @ApiOperation({ summary: 'Акты о повреждении техники' })
  list(@CurrentOffice() officeId: number, @Query() query: PaginationDto) {
    return this.waybills.listConditionActs(officeId, query);
  }
}

@Module({
  imports: [FuelModule, DriversModule, VehiclesModule],
  controllers: [WaybillsController, ConditionActsController],
  providers: [WaybillsService],
  exports: [WaybillsService],
})
export class WaybillsModule {}
