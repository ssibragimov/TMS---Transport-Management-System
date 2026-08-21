/**
 * Состояние техники при выдаче и возврате из смены.
 *
 * Здесь, а не только в базе: решение «нужен ли акт» принимают и сервер
 * (при закрытии путевого листа), и клиент (когда предупреждает диспетчера
 * до нажатия кнопки). Правило одно на обе стороны.
 */

export const VehicleCondition = {
  SERVICEABLE: 'SERVICEABLE',
  MINOR_DEFECTS: 'MINOR_DEFECTS',
  UNSERVICEABLE: 'UNSERVICEABLE',
  DAMAGED: 'DAMAGED',
  ACCIDENT: 'ACCIDENT',
} as const;
export type VehicleCondition = (typeof VehicleCondition)[keyof typeof VehicleCondition];

/**
 * Порядок тяжести. Сравнение по нему решает, ухудшилось ли состояние
 * за смену: акт составляется именно на ухудшение, а не на любую отметку
 * «неисправна» — техника могла уйти в смену уже с замечаниями.
 */
const SEVERITY: Record<VehicleCondition, number> = {
  SERVICEABLE: 0,
  MINOR_DEFECTS: 1,
  UNSERVICEABLE: 2,
  DAMAGED: 3,
  ACCIDENT: 4,
};

export const CONDITION_LABEL: Record<VehicleCondition, string> = {
  SERVICEABLE: 'Исправна',
  MINOR_DEFECTS: 'Мелкие замечания',
  UNSERVICEABLE: 'Неисправна',
  DAMAGED: 'Повреждена',
  ACCIDENT: 'ДТП',
};

export const CONDITION_COLOR: Record<VehicleCondition, string> = {
  SERVICEABLE: 'green',
  MINOR_DEFECTS: 'gold',
  UNSERVICEABLE: 'orange',
  DAMAGED: 'red',
  ACCIDENT: 'magenta',
};

export function conditionSeverity(condition: VehicleCondition): number {
  return SEVERITY[condition];
}

/**
 * Требуется ли акт о состоянии техники.
 *
 * Акт нужен, когда машину вернули хуже, чем выдали. Возврат в том же
 * состоянии акта не требует, даже если оно изначально было неисправным:
 * иначе на каждую машину с давним замечанием акт составлялся бы каждую смену
 * и перестал бы что-либо значить.
 */
export function needsConditionAct(
  onIssue: VehicleCondition | null | undefined,
  onReturn: VehicleCondition | null | undefined,
): boolean {
  if (!onReturn) return false;
  // Состояние на выдаче могли не заполнить — считаем, что техника была исправна:
  // именно так её и обязаны выдавать.
  const issued = onIssue ?? VehicleCondition.SERVICEABLE;
  return SEVERITY[onReturn] > SEVERITY[issued];
}
