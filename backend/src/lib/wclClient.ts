import axios from 'axios';
import { HttpError } from '../middlewares/errorHandler';

/**
 * Client GraphQL Warcraft Logs v2 (client credentials).
 * Le token est mis en cache jusqu'à son expiration et renouvelé une fois sur 401.
 */

export type WclLocale = 'en' | 'fr';

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
/** WCL localise les noms (boss, donjons) selon le sous-domaine de l'endpoint. */
const API_HOSTS: Record<WclLocale, string> = {
  en: 'https://www.warcraftlogs.com',
  fr: 'https://fr.warcraftlogs.com',
};
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

let cachedToken: { value: string; expiresAt: number } | null = null;
let pendingToken: Promise<string> | null = null;

export function isWclConfigured(): boolean {
  const id = process.env.WCL_CLIENT_ID;
  const secret = process.env.WCL_CLIENT_SECRET;
  return !!id && !!secret && !id.includes('your_') && !secret.includes('your_');
}

async function requestToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`,
  ).toString('base64');
  const response = await axios.post(TOKEN_URL, 'grant_type=client_credentials', {
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 5000,
  });
  const { access_token: token, expires_in: expiresIn } = response.data ?? {};
  if (!token) throw new Error('Empty access token');
  cachedToken = {
    value: token,
    expiresAt: Date.now() + (Number(expiresIn) || 3600) * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  };
  return token;
}

/** Token applicatif WCL, ou null si les identifiants sont absents ou refusés. */
export async function getWclAccessToken(): Promise<string | null> {
  if (!isWclConfigured()) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  pendingToken ??= requestToken().finally(() => {
    pendingToken = null;
  });
  try {
    return await pendingToken;
  } catch (err) {
    console.warn('[WCL] Error acquiring access token:', err instanceof Error ? err.message : err);
    return null;
  }
}

function invalidateToken() {
  cachedToken = null;
}

/**
 * Exécute une requête GraphQL. Toute erreur (réseau, HTTP, GraphQL) devient une HttpError 502
 * `WCL_UNAVAILABLE` : une 401 WCL ne doit jamais être confondue avec l'expiration du token Blizzard.
 */
export async function wclQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { locale?: WclLocale; timeout?: number } = {},
): Promise<T> {
  const { locale = 'en', timeout = 10_000 } = options;

  const send = async (retryOnUnauthorized: boolean): Promise<T> => {
    const token = await getWclAccessToken();
    if (!token) throw new HttpError(503, 'Warcraft Logs is not configured', 'WCL_UNAVAILABLE');

    try {
      const response = await axios.post(
        `${API_HOSTS[locale]}/api/v2/client`,
        { query, variables },
        { headers: { Authorization: `Bearer ${token}` }, timeout },
      );
      if (response.data?.errors?.length) {
        const message = response.data.errors.map((e: { message: string }) => e.message).join('; ');
        throw new HttpError(502, `Warcraft Logs GraphQL error: ${message}`, 'WCL_UNAVAILABLE');
      }
      return response.data.data as T;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (axios.isAxiosError(err) && err.response?.status === 401 && retryOnUnauthorized) {
        invalidateToken();
        return send(false);
      }
      const reason = axios.isAxiosError(err)
        ? `${err.response?.status ?? err.code ?? 'network'}`
        : err instanceof Error
          ? err.message
          : String(err);
      throw new HttpError(502, `Warcraft Logs request failed (${reason})`, 'WCL_UNAVAILABLE');
    }
  };

  return send(true);
}
