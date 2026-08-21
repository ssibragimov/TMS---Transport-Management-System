/**
 * Предрейсовый контроль технического состояния.
 *
 * Правила совпадают с медицинским допуском: заключение действует ограниченное
 * время, отказ перекрывает всё остальное. Поэтому расчёт переиспользуется
 * из medical.ts — две одинаковые реализации разошлись бы, и расхождение
 * всплыло бы на разборе выпуска.
 *
 * Отличаются подписи и смысл: медик отвечает за человека, механик — за машину.
 */

import { evaluateClearance, type ClearanceState, type ClearanceVerdict } from './medical';

export type { ClearanceState, ClearanceVerdict };

/**
 * Сколько действует заключение механика по умолчанию, часы.
 *
 * Столько же, сколько медицинский допуск: обе проверки делаются перед сменой
 * и обе теряют смысл к её концу. Разные сроки только запутали бы диспетчера.
 */
export const TECHNICAL_DEFAULT_HOURS = 12;

export interface TechnicalCheck {
  result: 'PASSED' | 'FAILED' | 'CONDITIONAL';
  checkedAt: Date;
  validUntil?: Date | null;
}

export function evaluateTechnicalClearance(
  check: TechnicalCheck | null | undefined,
  at: Date = new Date(),
): ClearanceVerdict {
  return evaluateClearance(check, at);
}

export const TECHNICAL_LABEL: Record<ClearanceState, string> = {
  MISSING: 'Предрейсовый техосмотр не пройден',
  FAILED: 'Механик не выпустил технику на линию',
  EXPIRED: 'Срок заключения механика истёк',
  PASSED: 'Техника исправна, выпуск разрешён',
  CONDITIONAL: 'Выпуск разрешён с ограничениями',
};

/**
 * Что проверяет механик перед выпуском.
 *
 * Список — не украшение формы: он задаёт, о чём механик обязан отчитаться,
 * и попадает в заключение целиком. Для аэродромной техники к обычному
 * автомобильному перечню добавлен проблесковый маячок: без него машину
 * на перрон не выпустят независимо от исправности узлов.
 */
export const TECHNICAL_CHECKLIST = [
  { key: 'brakes', label: 'Тормозная система' },
  { key: 'steering', label: 'Рулевое управление' },
  { key: 'tyres', label: 'Шины и колёса' },
  { key: 'lights', label: 'Внешние световые приборы' },
  { key: 'beacon', label: 'Проблесковый маячок' },
  { key: 'leaks', label: 'Отсутствие подтёков топлива и масла' },
  { key: 'body', label: 'Кузов, зеркала, стёкла' },
] as const;

export type TechnicalChecklistKey = (typeof TECHNICAL_CHECKLIST)[number]['key'];
