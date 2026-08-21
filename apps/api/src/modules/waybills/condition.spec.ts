import { VehicleCondition, conditionSeverity, needsConditionAct } from '@gsm/shared';

describe('needsConditionAct', () => {
  it('не требует акта, когда технику вернули как выдали', () => {
    expect(needsConditionAct(VehicleCondition.SERVICEABLE, VehicleCondition.SERVICEABLE)).toBe(
      false,
    );
  });

  it('требует акта при ухудшении состояния', () => {
    expect(needsConditionAct(VehicleCondition.SERVICEABLE, VehicleCondition.DAMAGED)).toBe(true);
  });

  it('не требует акта, если техника ушла в смену уже неисправной и такой вернулась', () => {
    // Иначе на каждую машину с давним замечанием акт составлялся бы каждую
    // смену и перестал бы что-либо значить.
    expect(needsConditionAct(VehicleCondition.UNSERVICEABLE, VehicleCondition.UNSERVICEABLE)).toBe(
      false,
    );
  });

  it('не требует акта при улучшении — технику починили за смену', () => {
    expect(needsConditionAct(VehicleCondition.UNSERVICEABLE, VehicleCondition.SERVICEABLE)).toBe(
      false,
    );
  });

  it('требует акта, если к имеющимся замечаниям добавилось повреждение', () => {
    expect(needsConditionAct(VehicleCondition.MINOR_DEFECTS, VehicleCondition.ACCIDENT)).toBe(true);
  });

  it('незаполненное состояние на выдаче считает исправным', () => {
    // Техника обязана выдаваться исправной, поэтому пропуск поля не должен
    // становиться лазейкой, скрывающей повреждение.
    expect(needsConditionAct(null, VehicleCondition.DAMAGED)).toBe(true);
    expect(needsConditionAct(undefined, VehicleCondition.SERVICEABLE)).toBe(false);
  });

  it('без состояния на возврате акта не составляет', () => {
    expect(needsConditionAct(VehicleCondition.SERVICEABLE, null)).toBe(false);
  });

  it('тяжесть возрастает от исправной к ДТП', () => {
    expect(conditionSeverity(VehicleCondition.SERVICEABLE)).toBeLessThan(
      conditionSeverity(VehicleCondition.MINOR_DEFECTS),
    );
    expect(conditionSeverity(VehicleCondition.DAMAGED)).toBeLessThan(
      conditionSeverity(VehicleCondition.ACCIDENT),
    );
  });
});
