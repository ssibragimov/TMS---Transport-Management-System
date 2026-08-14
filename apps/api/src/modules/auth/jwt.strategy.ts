import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtAccessPayload } from '@gsm/shared';

import { APP_CONFIG, type AppConfig } from '@/config/configuration';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  /**
   * Валидация подписи и срока уже выполнена passport-jwt.
   * Здесь только проверяем, что токен содержит обязательные для RLS поля:
   * токен без officeScope не должен доходить до слоя данных.
   */
  validate(payload: JwtAccessPayload): JwtAccessPayload {
    if (!payload.sub || !payload.officeId || !Array.isArray(payload.officeScope)) {
      throw new Error('Некорректная структура токена');
    }
    return payload;
  }
}
