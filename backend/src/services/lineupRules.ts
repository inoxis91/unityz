import { HttpError } from '../middlewares/errorHandler';

export type RaidRole = 'tank' | 'heal' | 'dps';
export type LineupSelection = 'selected' | 'benched';

/** Le line-up (inscrits comme invités) n'est modifiable que sur un raid non annulé. */
export function assertLineupEditable(event: { type: string; is_canceled: boolean | null }): void {
  if (event.type?.toLowerCase() !== 'raid') {
    throw new HttpError(400, 'Line-up management is only available for raid events', 'NOT_A_RAID');
  }
  if (event.is_canceled) {
    throw new HttpError(409, 'This event has been canceled', 'EVENT_CANCELED');
  }
}
