import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

/**
 * Идентификатор записи в правом верхнем углу карточки.
 *
 * Зачем он вообще виден: при разборе обращения («не открывается карточка»,
 * «в отчёте не та машина») первым делом спрашивают идентификатор. Пока его
 * не было, приходилось искать запись в базе по косвенным признакам.
 *
 * Оформление приглушённое намеренно — это служебная пометка, а не часть
 * содержимого карточки. Она не должна перетягивать внимание с номера
 * путевого листа или гаражного номера, но должна читаться, когда её ищут.
 *
 * user-select: all — одним щелчком выделяется целиком: идентификатор чаще
 * всего копируют, чтобы вставить в переписку.
 */
interface EntityIdProps {
  id: number | string | null | undefined;
}

export function EntityId({ id }: EntityIdProps) {
  const { t } = useTranslation();

  if (id === null || id === undefined) return null;

  return (
    <Tooltip title={t('Идентификатор записи в базе данных')}>
      <span
        style={{
          opacity: 0.4,
          fontSize: 12,
          fontWeight: 500,
          // Моноширинные цифры: в списке одинаковых карточек номера
          // не «пляшут» по ширине.
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'all',
          whiteSpace: 'nowrap',
          cursor: 'default',
        }}
      >
        ID {id}
      </span>
    </Tooltip>
  );
}

/**
 * Заголовок карточки с идентификатором, прижатым вправо.
 *
 * Отдельный компонент нужен из-за окон: у Modal в правом верхнем углу стоит
 * крестик закрытия, и пометку приходится отодвигать от него отступом. Забыть
 * этот отступ в одном из полутора десятков окон слишком легко, поэтому
 * он живёт здесь, а не копируется по месту.
 *
 * У Drawer крестик слева, а справа есть слот extra — там EntityId ставится
 * напрямую, без этой обёртки.
 */
interface CardTitleProps {
  title: ReactNode;
  id?: number | string | null;
}

export function CardTitle({ title, id }: CardTitleProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        // Место под крестик закрытия окна.
        paddingRight: 28,
      }}
    >
      <span>{title}</span>
      <EntityId id={id} />
    </div>
  );
}
