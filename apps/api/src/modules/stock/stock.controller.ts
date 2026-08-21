import {
  Body,
  Controller,
  Get,
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

/*
 * DTO импортируются значениями, а не через `import type`.
 *
 * ValidationPipe читает типы параметров через метаданные декораторов;
 * при импорте типом класс стирается на компиляции, метаданных не остаётся,
 * и валидация тихо перестаёт работать — тело запроса проходит как есть.
 * Правило зафиксировано в .eslintrc.json для apps/api.
 */
import {
  CreateStockIssueDto,
  CreateStockItemDto,
  CreateStockReceiptDto,
  CreateStockReturnDto,
  CreateStockTransferDto,
  CreateStockWriteOffDto,
  CreateWarehouseDto,
  SetMinQuantityDto,
  StockBalanceQueryDto,
  StockDocumentQueryDto,
  StockMovementQueryDto,
  TurnoverQueryDto,
  UpdateStockItemDto,
  UpdateWarehouseDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

@ApiTags('stock')
@Audited('Stock')
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  // ─── Справочная часть ─────────────────────────────────────────────────────

  @Get('summary')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Сводка по складам офиса' })
  summary(@CurrentOffice() officeId: number) {
    return this.stock.summary(officeId);
  }

  @Get('items')
  @RequirePermissions(PERMISSIONS.SPARE_PART_READ)
  @ApiOperation({ summary: 'Номенклатура ТМЦ с остатком по офису' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'includeInactive', required: false })
  items(
    @CurrentOffice() officeId: number,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.stock.listItems(officeId, search, includeInactive === 'true');
  }

  /*
   * Правка справочника помечается как SparePart, а не Stock: для неё
   * журнал умеет показать «было → стало» по одной таблице. У складских
   * документов такого снимка нет — они меняют и документ, и остатки сразу.
   */
  @Post('items')
  @Audited('SparePart')
  @RequirePermissions(PERMISSIONS.SPARE_PART_MANAGE)
  @ApiOperation({ summary: 'Завести позицию номенклатуры' })
  createItem(@Body() dto: CreateStockItemDto) {
    return this.stock.createItem(dto);
  }

  @Patch('items/:id')
  @Audited('SparePart')
  @RequirePermissions(PERMISSIONS.SPARE_PART_MANAGE)
  @ApiOperation({ summary: 'Изменить позицию номенклатуры' })
  updateItem(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStockItemDto) {
    return this.stock.updateItem(id, dto);
  }

  @Get('items/:id/card')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Карточка складского учёта позиции' })
  @ApiQuery({ name: 'warehouseId', required: false })
  itemCard(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stock.itemCard(officeId, id, warehouseId ? Number(warehouseId) : undefined);
  }

  @Get('warehouses')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Склады офиса с итогами' })
  warehouses(@CurrentOffice() officeId: number) {
    return this.stock.listWarehouses(officeId);
  }

  @Post('warehouses')
  @Audited('Warehouse')
  @RequirePermissions(PERMISSIONS.SPARE_PART_MANAGE)
  @ApiOperation({ summary: 'Завести склад' })
  createWarehouse(@CurrentOffice() officeId: number, @Body() dto: CreateWarehouseDto) {
    return this.stock.createWarehouse(officeId, dto);
  }

  @Patch('warehouses/:id')
  @Audited('Warehouse')
  @RequirePermissions(PERMISSIONS.SPARE_PART_MANAGE)
  @ApiOperation({ summary: 'Изменить склад' })
  updateWarehouse(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.stock.updateWarehouse(officeId, id, dto);
  }

  @Post('min-quantity')
  @RequirePermissions(PERMISSIONS.SPARE_PART_MANAGE)
  @ApiOperation({ summary: 'Задать неснижаемый запас позиции на складе' })
  setMinQuantity(@CurrentOffice() officeId: number, @Body() dto: SetMinQuantityDto) {
    return this.stock.setMinQuantity(officeId, dto);
  }

  // ─── Остатки и журналы ────────────────────────────────────────────────────

  @Get('balances')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Остатки по складам' })
  balances(@CurrentOffice() officeId: number, @Query() query: StockBalanceQueryDto) {
    return this.stock.listBalances(officeId, query);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Журнал движений' })
  movements(@CurrentOffice() officeId: number, @Query() query: StockMovementQueryDto) {
    return this.stock.listMovements(officeId, query);
  }

  @Get('documents')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Складские документы' })
  documents(@CurrentOffice() officeId: number, @Query() query: StockDocumentQueryDto) {
    return this.stock.listDocuments(officeId, query);
  }

  @Get('documents/:id')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Документ со строками' })
  document(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.stock.getDocument(officeId, id);
  }

  // ─── Проведение ───────────────────────────────────────────────────────────

  @Post('receipts')
  @RequirePermissions(PERMISSIONS.STOCK_RECEIPT)
  @ApiOperation({ summary: 'Приход от поставщика' })
  createReceipt(@CurrentOffice() officeId: number, @Body() dto: CreateStockReceiptDto) {
    return this.stock.createReceipt(officeId, dto);
  }

  @Post('issues')
  @RequirePermissions(PERMISSIONS.STOCK_ISSUE)
  @ApiOperation({
    summary: 'Выдача ТМЦ',
    description:
      'Требование-накладная. Получатель обязателен. Позиции с обменом ' +
      '«старое на новое» либо принимают отработанное на склад утилизации, ' +
      'либо требуют записанной причины выдачи без обмена.',
  })
  createIssue(@CurrentOffice() officeId: number, @Body() dto: CreateStockIssueDto) {
    return this.stock.createIssue(officeId, dto);
  }

  @Post('returns')
  @RequirePermissions(PERMISSIONS.STOCK_ISSUE)
  @ApiOperation({ summary: 'Возврат неиспользованного на склад' })
  createReturn(@CurrentOffice() officeId: number, @Body() dto: CreateStockReturnDto) {
    return this.stock.createReturn(officeId, dto);
  }

  @Post('write-offs')
  @RequirePermissions(PERMISSIONS.STOCK_WRITE_OFF)
  @ApiOperation({ summary: 'Списание по акту' })
  createWriteOff(@CurrentOffice() officeId: number, @Body() dto: CreateStockWriteOffDto) {
    return this.stock.createWriteOff(officeId, dto);
  }

  @Post('transfers')
  @RequirePermissions(PERMISSIONS.STOCK_TRANSFER)
  @ApiOperation({ summary: 'Перемещение между складами' })
  createTransfer(@CurrentOffice() officeId: number, @Body() dto: CreateStockTransferDto) {
    return this.stock.createTransfer(officeId, dto);
  }

  // ─── Отчёты ───────────────────────────────────────────────────────────────

  @Get('reports/turnover')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Оборотная ведомость за период' })
  turnover(@CurrentOffice() officeId: number, @Query() query: TurnoverQueryDto) {
    return this.stock.turnover(officeId, query);
  }

  @Get('reports/by-vehicle')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Расход ТМЦ по технике за период' })
  byVehicle(@CurrentOffice() officeId: number, @Query() query: TurnoverQueryDto) {
    return this.stock.byVehicle(officeId, query);
  }
}
