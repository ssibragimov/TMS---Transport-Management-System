import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@gsm/shared';

import { Audited } from '@/common/audit/audit.interceptor';
import { CurrentOffice, RequirePermissions } from '@/common/decorators';

import {
  CreateFuelIssueDto,
  CreateFuelReceiptDto,
  CreateFuelTankDto,
  FuelIssueQueryDto,
  UpdateFuelTankDto,
} from './dto/fuel.dto';
import { FuelNormsService } from './fuel-norms.service';
import { FuelService } from './fuel.service';

@ApiTags('fuel')
@Audited('Fuel')
@Controller('fuel')
export class FuelController {
  constructor(
    private readonly fuel: FuelService,
    private readonly norms: FuelNormsService,
  ) {}

  @Get('tanks')
  @RequirePermissions(PERMISSIONS.FUEL_READ)
  @ApiOperation({ summary: 'Ёмкости хранения и остатки' })
  tanks(@CurrentOffice() officeId: number) {
    return this.fuel.listTanks(officeId);
  }

  @Post('tanks')
  @RequirePermissions(PERMISSIONS.FUEL_TANK_MANAGE)
  @ApiOperation({ summary: 'Новая ёмкость хранения' })
  createTank(@CurrentOffice() officeId: number, @Body() dto: CreateFuelTankDto) {
    return this.fuel.createTank(officeId, dto);
  }

  @Patch('tanks/:id')
  @RequirePermissions(PERMISSIONS.FUEL_TANK_MANAGE)
  @ApiOperation({ summary: 'Изменить параметры ёмкости' })
  updateTank(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFuelTankDto,
  ) {
    return this.fuel.updateTank(officeId, id, dto);
  }

  @Delete('tanks/:id')
  @RequirePermissions(PERMISSIONS.FUEL_TANK_MANAGE)
  @ApiOperation({ summary: 'Удалить ёмкость (только пустую)' })
  removeTank(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.fuel.removeTank(officeId, id);
  }

  @Get('issues')
  @RequirePermissions(PERMISSIONS.FUEL_READ)
  @ApiOperation({ summary: 'Журнал выдачи топлива' })
  issues(@CurrentOffice() officeId: number, @Query() query: FuelIssueQueryDto) {
    return this.fuel.listIssues(officeId, query);
  }

  @Get('receipts')
  @RequirePermissions(PERMISSIONS.FUEL_READ)
  @ApiOperation({ summary: 'Журнал прихода топлива' })
  receipts(@CurrentOffice() officeId: number, @Query() query: FuelIssueQueryDto) {
    return this.fuel.listReceipts(officeId, query);
  }

  @Get('inventories')
  @RequirePermissions(PERMISSIONS.FUEL_READ)
  @ApiOperation({ summary: 'Акты инвентаризации' })
  inventories(@CurrentOffice() officeId: number, @Query() query: FuelIssueQueryDto) {
    return this.fuel.listInventories(officeId, query);
  }

  @Post('receipts')
  @RequirePermissions(PERMISSIONS.FUEL_RECEIPT_MANAGE)
  @ApiOperation({ summary: 'Оприходование топлива в ёмкость' })
  createReceipt(@CurrentOffice() officeId: number, @Body() dto: CreateFuelReceiptDto) {
    return this.fuel.createReceipt(officeId, dto);
  }

  @Post('issues')
  @RequirePermissions(PERMISSIONS.FUEL_ISSUE_CREATE)
  @ApiOperation({ summary: 'Выдача топлива в бак техники' })
  createIssue(@CurrentOffice() officeId: number, @Body() dto: CreateFuelIssueDto) {
    return this.fuel.createIssue(officeId, dto);
  }

  @Post('inventories')
  @RequirePermissions(PERMISSIONS.FUEL_INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Акт инвентаризации ёмкости' })
  createInventory(
    @CurrentOffice() officeId: number,
    @Body()
    dto: {
      tankId: number;
      countedAt: string;
      actualVolume: number;
      commission?: string;
      notes?: string;
    },
  ) {
    return this.fuel.createInventory(officeId, dto);
  }

  @Get('norms/preview')
  @RequirePermissions(PERMISSIONS.FUEL_READ)
  @ApiQuery({ name: 'vehicleId', required: true })
  @ApiQuery({ name: 'onDate', required: false, description: 'Дата, по умолчанию сегодня' })
  @ApiOperation({
    summary: 'Нормы, действующие для техники на дату',
    description:
      'Используется формой путевого листа для предпросмотра расчёта. ' +
      'Возвращает те же правила, по которым расход считается при закрытии.',
  })
  previewNorms(
    @CurrentOffice() officeId: number,
    @Query('vehicleId') vehicleId: string,
    @Query('onDate') onDate?: string,
  ) {
    return this.norms.resolveNorms(
      officeId,
      Number(vehicleId),
      onDate ? new Date(onDate) : new Date(),
    );
  }
}

@Module({
  controllers: [FuelController],
  providers: [FuelService, FuelNormsService],
  exports: [FuelService, FuelNormsService],
})
export class FuelModule {}
