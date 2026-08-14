import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { PERMISSIONS } from '@gsm/shared';

import { AuditAs, Audited } from '@/common/audit/audit.interceptor';
import { CurrentOffice, RequirePermissions } from '@/common/decorators';

import {
  CreateUserDto,
  ResetPasswordDto,
  RoleDto,
  UpdateRoleDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';

@ApiTags('users')
@Audited('User')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly roles: RolesService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Пользователи офиса' })
  list(@CurrentOffice() officeId: number, @Query() query: UserQueryDto) {
    return this.users.list(officeId, query);
  }

  // Маршруты справочников объявлены до ':id', иначе Nest примет "roles"
  // за идентификатор и ParseIntPipe вернёт 400.
  @Get('roles')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Роли и их наборы прав' })
  listRoles() {
    return this.roles.list();
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Каталог прав, сгруппированный для интерфейса' })
  listPermissions() {
    return this.roles.permissions();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Карточка пользователя с офисами и ролями' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({
    summary: 'Создание пользователя',
    description:
      'Офисы и роли назначаются списком: роль действует в конкретном офисе. ' +
      'Назначить офис вне своей области видимости нельзя.',
  })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Изменение пользователя, его офисов и ролей' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/reset-password')
  @Audited('UserPassword')
  @AuditAs(AuditAction.UPDATE)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({
    summary: 'Сброс пароля администратором',
    description: 'Завершает все активные сессии пользователя.',
  })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.users.resetPassword(id, dto.password);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Блокировка учётной записи (мягкое удаление)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.users.remove(id);
  }
}

@ApiTags('roles')
@Audited('Role')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: 'Создание роли' })
  create(@Body() dto: RoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({
    summary: 'Изменение роли',
    description:
      'Набор прав заменяется целиком. Изменение действует на всех, кому роль назначена.',
  })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: 'Удаление роли. Системные роли удалить нельзя.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roles.remove(id);
  }
}
