import { buildYear, coveredMonths, monthState, monthlyShare } from './fees-utils';

const alloc = (month_date: string, amount: number) => ({
  id: month_date,
  user_id: 'u',
  month_date,
  amount,
});

describe('fees-utils', () => {
  it('classe un mois selon le minimum', () => {
    expect(monthState(0, 2000)).toBe('none');
    expect(monthState(500, 2000)).toBe('partial');
    expect(monthState(2000, 2000)).toBe('paid');
    expect(monthState(2500, 2000)).toBe('donation');
  });

  it("construit les 12 mois de l'année en additionnant les allocations", () => {
    const year = buildYear(
      [
        alloc('2026-03-01', 1000),
        alloc('2026-03-01T00:00:00.000Z', 1000),
        alloc('2025-03-01', 9000),
      ],
      2026,
      2000,
    );
    expect(year).toHaveLength(12);
    expect(year[2]).toMatchObject({ key: '2026-03', amount: 2000, state: 'paid', progress: 100 });
    expect(year[0]).toMatchObject({ amount: 0, state: 'none', progress: 0 });
  });

  it("liste les mois couverts, y compris sur l'année suivante", () => {
    expect(coveredMonths('2026-11-01', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(coveredMonths('', 3)).toEqual([]);
  });

  it('répartit le montant comme le serveur (arrondi inférieur)', () => {
    expect(monthlyShare(6000, 3)).toBe(2000);
    expect(monthlyShare(1000, 3)).toBe(333);
    expect(monthlyShare(1000, 0)).toBe(0);
  });
});
