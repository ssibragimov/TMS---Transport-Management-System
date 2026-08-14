import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthTokens, CurrentUserDto, JwtAccessPayload } from '@gsm/shared';

import { CurrentUser, Public } from '@/common/decorators';

import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  SwitchOfficeDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Отдельный жёсткий лимит: вход — главная мишень перебора паролей.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход. Возвращает токены и профиль с активным офисом' })
  login(@Body() dto: LoginDto): Promise<AuthTokens & { user: CurrentUserDto }> {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновление пары токенов' })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens & { user: CurrentUserDto }> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выход: отзыв refresh-токена текущей сессии' })
  logout(@Body() dto: RefreshDto): Promise<{ success: true }> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiOperation({ summary: 'Профиль, права и доступные офисы' })
  me(@CurrentUser() user: JwtAccessPayload): Promise<CurrentUserDto> {
    return this.auth.me(user.sub, user.officeId);
  }

  @Post('switch-office')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Смена активного офиса',
    description:
      'Выдаёт новую пару токенов с другой областью видимости. ' +
      'Старые токены продолжают действовать до истечения срока — ' +
      'это осознанный компромисс ради скорости переключения.',
  })
  switchOffice(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: SwitchOfficeDto,
  ): Promise<AuthTokens & { user: CurrentUserDto }> {
    return this.auth.switchOffice(user.sub, dto.officeId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Смена пароля. Завершает все сессии пользователя' })
  changePassword(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    return this.auth.changePassword(user.sub, dto);
  }
}
