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

import { DictionariesService } from './dictionaries.service';
import {
  CounterpartyDto,
  DepartmentDto,
  DriverPositionDto,
  FuelTypeDto,
  SparePartDto,
  UpdateCounterpartyDto,
  UpdateDepartmentDto,
  UpdateDriverPositionDto,
  UpdateFuelTypeDto,
  UpdateSparePartDto,
  UpdateVehicleModelDto,
  UpdateViolationTypeDto,
  VehicleModelDto,
  ViolationTypeDto,
} from './dto/dictionary.dto';

/** `?includeInactive=true` — показать в том числе отключённые записи. */
const inactive = (value?: string): boolean => value === 'true';

@ApiTags('dictionaries')
@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiOperation({ summary: 'Все справочники, нужные формам' })
  all(@CurrentOffice() officeId: number) {
    return this.dictionaries.all(officeId);
  }

  // ─── Виды топлива ────────────────────────────────────────────────────────

  @Get('fuel-types')
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'Виды топлива' })
  fuelTypes(@Query('includeInactive') includeInactive?: string) {
    return this.dictionaries.fuelTypes(inactive(includeInactive));
  }

  @Post('fuel-types')
  @Audited('FuelType')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Добавление вида топлива' })
  createFuelType(@Body() dto: FuelTypeDto) {
    return this.dictionaries.createFuelType(dto);
  }

  @Patch('fuel-types/:id')
  @Audited('FuelType')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Изменение вида топлива' })
  updateFuelType(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFuelTypeDto) {
    return this.dictionaries.updateFuelType(id, dto);
  }

  @Delete('fuel-types/:id')
  @Audited('FuelType')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({
    summary: 'Удаление вида топлива',
    description: 'Если на него есть ссылки, запись не удаляется, а отключается.',
  })
  removeFuelType(@Param('id', ParseIntPipe) id: number) {
    return this.dictionaries.removeFuelType(id);
  }

  // ─── Модели техники ──────────────────────────────────────────────────────

  @Get('vehicle-models')
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'Модели техники' })
  vehicleModels(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.dictionaries.vehicleModels({
      category,
      includeInactive: inactive(includeInactive),
    });
  }

  @Post('vehicle-models')
  @Audited('VehicleModel')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Добавление модели техники' })
  createVehicleModel(@Body() dto: VehicleModelDto) {
    return this.dictionaries.createVehicleModel(dto);
  }

  @Patch('vehicle-models/:id')
  @Audited('VehicleModel')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Изменение модели техники' })
  updateVehicleModel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleModelDto,
  ) {
    return this.dictionaries.updateVehicleModel(id, dto);
  }

  @Delete('vehicle-models/:id')
  @Audited('VehicleModel')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Удаление модели техники' })
  removeVehicleModel(@Param('id', ParseIntPipe) id: number) {
    return this.dictionaries.removeVehicleModel(id);
  }

  // ─── Подразделения ───────────────────────────────────────────────────────

  @Get('departments')
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'Подразделения активного офиса' })
  departments(
    @CurrentOffice() officeId: number,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.dictionaries.departments(officeId, inactive(includeInactive));
  }

  @Post('departments')
  @Audited('Department')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Добавление подразделения' })
  createDepartment(@CurrentOffice() officeId: number, @Body() dto: DepartmentDto) {
    return this.dictionaries.createDepartment(officeId, dto);
  }

  @Patch('departments/:id')
  @Audited('Department')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Изменение подразделения' })
  updateDepartment(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.dictionaries.updateDepartment(officeId, id, dto);
  }

  @Delete('departments/:id')
  @Audited('Department')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Удаление подразделения' })
  removeDepartment(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaries.removeDepartment(officeId, id);
  }

  // ─── Должности водителей ─────────────────────────────────────────────────

  @Get('driver-positions')
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'Должности водителей активного офиса' })
  driverPositions(
    @CurrentOffice() officeId: number,
    @Query('departmentId') departmentId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.dictionaries.driverPositions(
      officeId,
      departmentId ? Number(departmentId) : undefined,
      inactive(includeInactive),
    );
  }

  @Post('driver-positions')
  @Audited('DriverPosition')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Добавление должности водителя' })
  createDriverPosition(@CurrentOffice() officeId: number, @Body() dto: DriverPositionDto) {
    return this.dictionaries.createDriverPosition(officeId, dto);
  }

  @Patch('driver-positions/:id')
  @Audited('DriverPosition')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Изменение должности водителя' })
  updateDriverPosition(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDriverPositionDto,
  ) {
    return this.dictionaries.updateDriverPosition(officeId, id, dto);
  }

  @Delete('driver-positions/:id')
  @Audited('DriverPosition')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Удаление должности водителя' })
  removeDriverPosition(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaries.removeDriverPosition(officeId, id);
  }

  // ─── Виды нарушений ──────────────────────────────────────────────────────

  @Get('violation-types')
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'Виды нарушений активного офиса' })
  violationTypes(
    @CurrentOffice() officeId: number,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.dictionaries.violationTypes(officeId, inactive(includeInactive));
  }

  @Post('violation-types')
  @Audited('ViolationType')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Добавление вида нарушения' })
  createViolationType(@CurrentOffice() officeId: number, @Body() dto: ViolationTypeDto) {
    return this.dictionaries.createViolationType(officeId, dto);
  }

  @Patch('violation-types/:id')
  @Audited('ViolationType')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Изменение вида нарушения' })
  updateViolationType(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateViolationTypeDto,
  ) {
    return this.dictionaries.updateViolationType(officeId, id, dto);
  }

  @Delete('violation-types/:id')
  @Audited('ViolationType')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Удаление вида нарушения' })
  removeViolationType(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaries.removeViolationType(officeId, id);
  }

  // ─── Контрагенты ─────────────────────────────────────────────────────────

  @Get('counterparties')
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiQuery({ name: 'kind', required: false, enum: ['fuel', 'service'] })
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'Контрагенты активного офиса' })
  counterparties(
    @CurrentOffice() officeId: number,
    @Query('kind') kind?: 'fuel' | 'service',
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.dictionaries.counterparties(officeId, kind, inactive(includeInactive));
  }

  @Post('counterparties')
  @Audited('Counterparty')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Добавление контрагента' })
  createCounterparty(@CurrentOffice() officeId: number, @Body() dto: CounterpartyDto) {
    return this.dictionaries.createCounterparty(officeId, dto);
  }

  @Patch('counterparties/:id')
  @Audited('Counterparty')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Изменение контрагента' })
  updateCounterparty(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCounterpartyDto,
  ) {
    return this.dictionaries.updateCounterparty(officeId, id, dto);
  }

  @Delete('counterparties/:id')
  @Audited('Counterparty')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Удаление контрагента' })
  removeCounterparty(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaries.removeCounterparty(officeId, id);
  }

  // ─── Запчасти ────────────────────────────────────────────────────────────

  @Get('spare-parts')
  @RequirePermissions(PERMISSIONS.DICTIONARY_READ)
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'Номенклатура запчастей' })
  spareParts(@Query('includeInactive') includeInactive?: string) {
    return this.dictionaries.spareParts(inactive(includeInactive));
  }

  @Post('spare-parts')
  @Audited('SparePart')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Добавление запчасти' })
  createSparePart(@Body() dto: SparePartDto) {
    return this.dictionaries.createSparePart(dto);
  }

  @Patch('spare-parts/:id')
  @Audited('SparePart')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Изменение запчасти' })
  updateSparePart(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSparePartDto) {
    return this.dictionaries.updateSparePart(id, dto);
  }

  @Delete('spare-parts/:id')
  @Audited('SparePart')
  @RequirePermissions(PERMISSIONS.DICTIONARY_MANAGE)
  @ApiOperation({ summary: 'Отключение запчасти' })
  removeSparePart(@Param('id', ParseIntPipe) id: number) {
    return this.dictionaries.removeSparePart(id);
  }
}

@Module({
  controllers: [DictionariesController],
  providers: [DictionariesService],
  exports: [DictionariesService],
})
export class DictionariesModule {}
