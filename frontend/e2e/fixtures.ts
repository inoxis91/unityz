import { readFileSync } from 'node:fs';

export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api';
export const MOCK_USER_ID = 'mock_user_6'; // GM (admin) de la guilde « Pro » : voit tous les onglets
export const PRO_GUILD_ID = '22222222-2222-4222-8222-222222222222';
export const STATE_PATH = 'e2e/.auth/state.json';
export const SEED_PATH = 'e2e/.auth/seed.json';

export interface Seed {
  eventId: string;
}

export function readSeed(): Seed {
  return JSON.parse(readFileSync(SEED_PATH, 'utf8')) as Seed;
}
