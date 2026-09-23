const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Échappe un texte avant de l'injecter dans du HTML brut (ex. eventContent de FullCalendar). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
