/**
 * Предрейсовый медицинский допуск.
 *
 * Здесь, а не в API, по той же причине, что нормы расхода и геометрия:
 * одно и то же решение принимают сервер (при выдаче путевого листа)
 * и клиент (когда показывает диспетчеру, можно ли выдавать, и врачу —
 * до какого времени действует его заключение). Две реализации разошлись бы,
 * и расхождение всплыло бы в самый неудобный момент — на разборе выпуска.
 */

/** Результат осмотра. Совпадает с перечислением CheckResult в базе. */
export type MedicalResult = 'PASSED' | 'FAILED' | 'CONDITIONAL';

/**
 * Сколько действует предрейсовый допуск по умолчанию, часы.
 *
 * Двенадцать — длина смены со стандартным запасом на пересменок. Врач может
 * указать другой срок: ночная смена и разовый выезд по вызову живут
 * по разным правилам.
 */
export const PRETRIP_DEFAULT_HOURS = 12;

export interface PreTripCheck {
  result: MedicalResult;
  checkedAt: Date;
  /** До какого момента действует. Если не задан — считается от checkedAt. */
  validUntil?: Date | null;
}

export type ClearanceState =
  /** Осмотра нет вовсе либо все просрочены. */
  | 'MISSING'
  /** Врач признал негодным. */
  | 'FAILED'
  /** Срок допуска истёк. */
  | 'EXPIRED'
  /** Допущен. */
  | 'PASSED'
  /** Допущен с ограничениями — диспетчер обязан прочитать примечание. */
  | 'CONDITIONAL';

export interface ClearanceVerdict {
  state: ClearanceState;
  /** Можно ли выдавать путевой лист. */
  allowed: boolean;
  /**
   * Можно ли выдать вопреки состоянию, имея право waybill.override_medical.
   * У отказа врача — нельзя ни при каких правах.
   */
  overridable: boolean;
  /** До какого момента допуск действует. */
  validUntil?: Date;
}

/** Момент окончания допуска: явный срок либо расчётный от времени осмотра. */
export function clearanceValidUntil(check: PreTripCheck): Date {
  if (check.validUntil) return check.validUntil;
  return new Date(check.checkedAt.getTime() + PRETRIP_DEFAULT_HOURS * 3600_000);
}

/**
 * Состояние допуска на заданный момент.
 *
 * Отказ врача перекрывает всё остальное и не зависит от срока: если человек
 * признан негодным, истёкший срок заключения не делает его годным. Поэтому
 * FAILED проверяется до истечения срока, а не после.
 */
export function evaluateClearance(
  check: PreTripCheck | null | undefined,
  at: Date = new Date(),
): ClearanceVerdict {
  if (!check) {
    // Осмотра нет. Это организационная ситуация — здравпункт закрыт, смену
    // подняли ночью, — и она снимается отдельным правом под запись в журнал.
    return { state: 'MISSING', allowed: false, overridable: true };
  }

  if (check.result === 'FAILED') {
    return {
      state: 'FAILED',
      allowed: false,
      overridable: false,
      validUntil: clearanceValidUntil(check),
    };
  }

  const validUntil = clearanceValidUntil(check);
  if (validUntil < at) {
    return { state: 'EXPIRED', allowed: false, overridable: true, validUntil };
  }

  return {
    state: check.result === 'CONDITIONAL' ? 'CONDITIONAL' : 'PASSED',
    allowed: true,
    overridable: false,
    validUntil,
  };
}

/** Человекочитаемое состояние допуска — для интерфейса и сообщений об отказе. */
export const CLEARANCE_LABEL: Record<ClearanceState, string> = {
  MISSING: 'Предрейсовый медосмотр не пройден',
  FAILED: 'Врач не допустил к работе',
  EXPIRED: 'Срок предрейсового допуска истёк',
  PASSED: 'Допущен врачом',
  CONDITIONAL: 'Допущен с ограничениями',
};
