export type EventTypeKey = 'raid' | 'mm' | 'reunion' | 'custom';

/** Clé de couleur d'un type d'activité (tokens --ui-event-* dans styles.css). */
export function eventTypeKey(type: string | undefined): EventTypeKey {
  const t = (type || '').toLowerCase();
  if (t.includes('raid')) return 'raid';
  if (t.includes('mm+')) return 'mm';
  if (t.includes('reunion') || t.includes('réunion')) return 'reunion';
  return 'custom';
}
