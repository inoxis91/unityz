import { absenceDays, absenceState, sortAbsences } from './absences-utils';

const abs = (id: string, start_date: string, end_date: string | null) => ({
  id,
  start_date,
  end_date,
  reason: null,
});

describe('absences-utils', () => {
  const today = '2026-09-24';

  it("situe une absence par rapport à aujourd'hui", () => {
    expect(absenceState(abs('a', '2026-09-20', '2026-09-24'), today)).toBe('current');
    expect(absenceState(abs('b', '2026-09-25', '2026-09-30'), today)).toBe('upcoming');
    expect(absenceState(abs('c', '2026-09-01', '2026-09-23'), today)).toBe('past');
    expect(absenceState(abs('d', '2026-01-01T00:00:00.000Z', null), today)).toBe('current');
  });

  it('compte les jours bornes incluses', () => {
    expect(absenceDays(abs('a', '2026-09-24', '2026-09-24'))).toBe(1);
    expect(absenceDays(abs('b', '2026-10-24', '2026-11-02'))).toBe(10);
    expect(absenceDays(abs('c', '2026-09-24', null))).toBeNull();
  });

  it('trie en cours, à venir puis passées', () => {
    const sorted = sortAbsences(
      [
        abs('past-old', '2026-01-01', '2026-01-02'),
        abs('upcoming-late', '2026-12-01', '2026-12-02'),
        abs('past-recent', '2026-09-01', '2026-09-02'),
        abs('current', '2026-09-20', null),
        abs('upcoming-soon', '2026-10-01', '2026-10-02'),
      ],
      today,
    );
    expect(sorted.map((a) => a.id)).toEqual([
      'current',
      'upcoming-soon',
      'upcoming-late',
      'past-recent',
      'past-old',
    ]);
  });
});
