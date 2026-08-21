import {
  PRETRIP_DEFAULT_HOURS,
  clearanceValidUntil,
  evaluateClearance,
  type PreTripCheck,
} from '@gsm/shared';

const at = (iso: string): Date => new Date(iso);

const check = (over: Partial<PreTripCheck> = {}): PreTripCheck => ({
  result: 'PASSED',
  checkedAt: at('2026-08-18T06:00:00Z'),
  ...over,
});

describe('clearanceValidUntil', () => {
  it('считает срок от времени осмотра, когда врач его не задал', () => {
    const until = clearanceValidUntil(check());
    expect(until.toISOString()).toBe('2026-08-18T18:00:00.000Z');
  });

  it('уважает срок, заданный врачом', () => {
    const until = clearanceValidUntil(check({ validUntil: at('2026-08-18T10:00:00Z') }));
    expect(until.toISOString()).toBe('2026-08-18T10:00:00.000Z');
  });

  it('срок по умолчанию — длина смены', () => {
    expect(PRETRIP_DEFAULT_HOURS).toBe(12);
  });
});

describe('evaluateClearance', () => {
  it('без осмотра не допускает, но позволяет обход по праву', () => {
    const verdict = evaluateClearance(null, at('2026-08-18T07:00:00Z'));
    expect(verdict.state).toBe('MISSING');
    expect(verdict.allowed).toBe(false);
    expect(verdict.overridable).toBe(true);
  });

  it('допускает при положительном заключении в пределах срока', () => {
    const verdict = evaluateClearance(check(), at('2026-08-18T14:00:00Z'));
    expect(verdict.state).toBe('PASSED');
    expect(verdict.allowed).toBe(true);
  });

  it('не допускает после истечения срока', () => {
    const verdict = evaluateClearance(check(), at('2026-08-18T19:00:00Z'));
    expect(verdict.state).toBe('EXPIRED');
    expect(verdict.allowed).toBe(false);
    expect(verdict.overridable).toBe(true);
  });

  it('отказ врача не обходится ничем', () => {
    const verdict = evaluateClearance(
      check({ result: 'FAILED' }),
      at('2026-08-18T07:00:00Z'),
    );
    expect(verdict.state).toBe('FAILED');
    expect(verdict.allowed).toBe(false);
    expect(verdict.overridable).toBe(false);
  });

  it('отказ остаётся отказом и после истечения срока', () => {
    // Иначе просроченное заключение «не годен» превращалось бы в отсутствие
    // заключения, которое снимается правом, — и недопущенный человек уезжал бы
    // в смену, просто дождавшись конца дня.
    const verdict = evaluateClearance(
      check({ result: 'FAILED' }),
      at('2026-08-19T12:00:00Z'),
    );
    expect(verdict.state).toBe('FAILED');
    expect(verdict.overridable).toBe(false);
  });

  it('условный допуск разрешает выдачу, но помечается отдельно', () => {
    const verdict = evaluateClearance(
      check({ result: 'CONDITIONAL' }),
      at('2026-08-18T09:00:00Z'),
    );
    expect(verdict.state).toBe('CONDITIONAL');
    expect(verdict.allowed).toBe(true);
  });

  it('осмотр действует ровно до заданного врачом момента', () => {
    const short = check({ validUntil: at('2026-08-18T08:00:00Z') });
    expect(evaluateClearance(short, at('2026-08-18T07:59:00Z')).allowed).toBe(true);
    expect(evaluateClearance(short, at('2026-08-18T08:01:00Z')).allowed).toBe(false);
  });
});
