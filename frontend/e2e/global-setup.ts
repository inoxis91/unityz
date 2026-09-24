import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { request, type APIResponse } from '@playwright/test';
import {
  API_URL,
  MOCK_USER_ID,
  PRO_GUILD_ID,
  SEED_PATH,
  STATE_PATH,
  WCL_REPORT_URL,
  type Seed,
} from './fixtures';

async function ok(res: APIResponse, step: string) {
  if (!res.ok()) throw new Error(`[e2e setup] ${step}: HTTP ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Connexion mock + onboarding complet par l'API, puis un raid de test avec une inscription. */
export default async function globalSetup() {
  const api = await request.newContext({ baseURL: `${API_URL}/` });

  await ok(await api.post('mock-auth/login', { data: { mockUserId: MOCK_USER_ID } }), 'mock login');
  const guild = await ok(
    await api.post('users/active-guild', { data: { guildId: PRO_GUILD_ID } }),
    'select guild',
  );
  await ok(
    await api.post('users/import-characters', { data: { characters: guild.characters ?? [] } }),
    'import characters',
  );

  const start = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  const event = await ok(
    await api.post('events', {
      data: {
        title: '[e2e] Raid a11y',
        description: 'Seeded by Playwright',
        type: 'raid',
        start_time: start.toISOString(),
        end_time: new Date(start.getTime() + 3 * 3600 * 1000).toISOString(),
        // Rapport public : analysé avec des clés WCL, état « indisponible » sans (CI)
        logs: WCL_REPORT_URL,
      },
    }),
    'create event',
  );

  const characters = await ok(await api.get('characters'), 'list characters');
  // A main character makes the dashboard hero card render
  if (characters[0]) await ok(await api.patch(`characters/${characters[0].id}/main`), 'set main');
  await ok(
    await api.post(`events/${event.id}/signup`, {
      data: {
        character_id: characters[0]?.id ?? null,
        role: 'heal',
        comment: 'e2e',
        status: 'signed_up',
      },
    }),
    'signup',
  );

  mkdirSync(dirname(STATE_PATH), { recursive: true });
  await api.storageState({ path: STATE_PATH });
  writeFileSync(SEED_PATH, JSON.stringify({ eventId: event.id } satisfies Seed));
  await api.dispose();
}
