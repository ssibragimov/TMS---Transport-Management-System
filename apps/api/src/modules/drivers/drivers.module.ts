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

import { DriversService } from './drivers.service';
import {
  CreateDriverDto,
  DriverLicenseDto,
  DriverPermitDto,
  DriverQueryDto,
  MedicalCheckDto,
  UpdateDriverDto,
} from './dto/driver.dto';

@ApiTags('drivers')
@Audited('Driver')
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiOperation({ summary: 'Список водителей активного офиса' })
  list(@CurrentOffice() officeId: number, @Query() query: DriverQueryDto) {
    return this.drivers.list(officeId, query);
  }

  @Get('expiring')
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOperation({
    summary: 'Истекающие права, допуски и медосмотры',
    description: 'Источник данных для виджета «истекает через N дней» на главной.',
  })
  expiring(@CurrentOffice() officeId: number, @Query('days') days?: string) {
    return this.drivers.expiringClearances(officeId, days ? Number(days) : 30);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiOperation({ summary: 'Карточка водителя' })
  findOne(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.drivers.findOne(officeId, id);
  }

  @Get(':id/eligibility')
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiQuery({ name: 'airside', required: false, type: Boolean })
  @ApiOperation({ summary: 'Проверка допуска водителя к работе' })
  eligibility(
    @Param('id', ParseIntPipe) id: number,
    @Query('airside') airside?: string,
  ) {
    return this.drivers.checkEligibility(id, {
      requiresAirsidePermit: airside !== 'false',
    });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DRIVER_CREATE)
  @ApiOperation({ summary: 'Приём водителя' })
  create(@CurrentOffice() officeId: number, @Body() dto: CreateDriverDto) {
    return this.drivers.create(officeId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DRIVER_UPDATE)
  @ApiOperation({ summary: 'Изменение карточки водителя' })
  update(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(officeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DRIVER_DELETE)
  @ApiOperation({ summary: 'Удаление водителя (мягкое)' })
  remove(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.drivers.remove(officeId, id);
  }

  // ─── Права, допуски, медосмотры ──────────────────────────────────────────

  @Post(':id/licenses')
  @Audited('DriverLicense')
  @RequirePermissions(PERMISSIONS.DRIVER_CLEARANCE_MANAGE)
  @ApiOperation({ summary: 'Водительское удостоверение' })
  addLicense(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DriverLicenseDto,
  ) {
    return this.drivers.addLicense(officeId, id, dto);
  }

  @Delete(':id/licenses/:licenseId')
  @Audited('DriverLicense')
  @RequirePermissions(PERMISSIONS.DRIVER_CLEARANCE_MANAGE)
  @ApiOperation({ summary: 'Удаление удостоверения' })
  removeLicense(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('licenseId', ParseIntPipe) licenseId: number,
  ) {
    return this.drivers.removeLicense(officeId, id, licenseId);
  }

  @Post(':id/permits')
  @Audited('DriverPermit')
  @RequirePermissions(PERMISSIONS.DRIVER_CLEARANCE_MANAGE)
  @ApiOperation({ summary: 'Допуск в контролируемую зону аэродрома' })
  addPermit(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DriverPermitDto,
  ) {
    return this.drivers.addPermit(officeId, id, dto);
  }

  @Delete(':id/permits/:permitId')
  @Audited('DriverPermit')
  @RequirePermissions(PERMISSIONS.DRIVER_CLEARANCE_MANAGE)
  @ApiOperation({ summary: 'Удаление допуска' })
  removePermit(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('permitId', ParseIntPipe) permitId: number,
  ) {
    return this.drivers.removePermit(officeId, id, permitId);
  }

  @Post(':id/medical-checks')
  @Audited('MedicalCheck')
  @RequirePermissions(PERMISSIONS.DRIVER_MEDICAL_MANAGE)
  @ApiOperation({
    summary: 'Медосмотр — периодический или предрейсовый',
    description:
      'Право driver.medical.manage отделено от driver.clearance.manage: ' +
      'начальник автослужбы не подписывает медосмотр, врач не продлевает ' +
      'удостоверение. В этом и смысл предрейсового контроля.',
  })
  addMedicalCheck(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MedicalCheckDto,
  ) {
    return this.drivers.addMedicalCheck(officeId, id, dto);
  }

  @Get(':id/medical-clearance')
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiOperation({
    summary: 'Действующий предрейсовый допуск водителя',
    description: 'То основание, по которому диспетчер вправе выдать путевой лист.',
  })
  medicalClearance(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.drivers.medicalClearanceOf(officeId, id);
  }
}

/**
 * Здравпункт — рабочее место медработника.
 *
 * Вынесено отдельным контроллером, а не вкладкой в водителях: врач приходит
 * в систему за одним действием и работает в темпе очереди перед сменой.
 */
@ApiTags('medical')
@Audited('MedicalCheck')
@Controller('medical')
export class MedicalController {
  constructor(private readonly drivers: DriversService) {}

  @Get('queue')
  @RequirePermissions(PERMISSIONS.DRIVER_READ)
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({
    summary: 'Очередь на осмотр: водители офиса и состояние их допуска',
    description: 'Показывает и осмотренных, и ещё не пришедших — врач видит, кого ждать.',
  })
  queue(@CurrentOffice() officeId: number, @Query('search') search?: string) {
    return this.drivers.medicalQueue(officeId, search);
  }
}

@Module({
  controllers: [DriversController, MedicalController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
