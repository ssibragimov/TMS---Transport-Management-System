import { Module } from '@nestjs/common';

import { RolesService } from './roles.service';
import { RolesController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, RolesController],
  providers: [UsersService, RolesService],
  exports: [UsersService, RolesService],
})
export class UsersModule {}
