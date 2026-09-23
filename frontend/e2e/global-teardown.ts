import { existsSync } from 'node:fs';
import { request } from '@playwright/test';
import { API_URL, SEED_PATH, STATE_PATH, readSeed } from './fixtures';

export default async function globalTeardown() {
  if (!existsSync(SEED_PATH)) return;
  const api = await request.newContext({ baseURL: `${API_URL}/`, storageState: STATE_PATH });
  await api.delete(`events/${readSeed().eventId}`);
  await api.dispose();
}
