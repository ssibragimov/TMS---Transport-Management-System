import { StockMovementType, movementSign, movingAveragePrice, signedQuantity } from '@gsm/shared';

describe('signedQuantity', () => {
  it('приход увеличивает остаток', () => {
    expect(signedQuantity(StockMovementType.RECEIPT, 10)).toBe(10);
    expect(signedQuantity(StockMovementType.RETURN, 3)).toBe(3);
    expect(signedQuantity(StockMovementType.TRANSFER_IN, 5)).toBe(5);
  });

  it('расход уменьшает остаток', () => {
    expect(signedQuantity(StockMovementType.ISSUE, 10)).toBe(-10);
    expect(signedQuantity(StockMovementType.WRITE_OFF, 2)).toBe(-2);
    expect(signedQuantity(StockMovementType.TRANSFER_OUT, 5)).toBe(-5);
  });

  it('игнорирует знак, введённый кладовщиком', () => {
    // Кладовщик вводит «выдал пять литров», а не «минус пять». Знак ставит
    // система: иначе минус, случайно набранный в поле количества, превратил
    // бы выдачу в приход.
    expect(signedQuantity(StockMovementType.ISSUE, -10)).toBe(-10);
    expect(signedQuantity(StockMovementType.RECEIPT, -10)).toBe(10);
  });

  it('приём отработанного при обмене — это приход на склад утилизации', () => {
    expect(signedQuantity(StockMovementType.USED_RETURN, 1)).toBe(1);
  });

  it('корректировка по инвентаризации сохраняет знак: она принимает и недостачу, и излишек', () => {
    expect(signedQuantity(StockMovementType.INVENTORY_ADJ, -4)).toBe(-4);
    expect(signedQuantity(StockMovementType.INVENTORY_ADJ, 4)).toBe(4);
    expect(movementSign(StockMovementType.INVENTORY_ADJ)).toBe(0);
  });
});

describe('movingAveragePrice', () => {
  it('усредняет цену по количеству, а не по числу поставок', () => {
    // 100 л по 60 000 и 20 л по 90 000 — средняя ближе к первой цене.
    expect(movingAveragePrice(100, 60_000, 20, 90_000)).toBe(65_000);
  });

  it('первый приход задаёт цену целиком', () => {
    expect(movingAveragePrice(0, 0, 50, 62_000)).toBe(62_000);
  });

  it('не делит на ноль при нулевом итоговом остатке', () => {
    expect(movingAveragePrice(0, 62_000, 0, 90_000)).toBe(62_000);
  });

  it('не меняет цену, если приход обнуляет остаток отрицательным количеством', () => {
    // Такого вызова быть не должно, но молчаливая NaN в себестоимости
    // разошлась бы по всем отчётам разом.
    expect(movingAveragePrice(10, 5_000, -10, 9_000)).toBe(5_000);
  });
});
