import { Module } from '@nestjs/common';

import { TechnicalController, VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [VehiclesController, TechnicalController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
