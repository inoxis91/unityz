import type {
  HelpCategory,
  HelpKind,
  HelpOverview,
  HelpPair,
  HelpPost,
  HelpRole,
} from '../../services/guild-help';

export const HELP_CATEGORIES: readonly { value: HelpCategory; emoji: string }[] = [
  { value: 'mplus', emoji: '🗝️' },
  { value: 'raid', emoji: '🐉' },
  { value: 'class', emoji: '📘' },
  { value: 'gear', emoji: '🛡️' },
  { value: 'professions', emoji: '⚒️' },
  { value: 'gold', emoji: '💰' },
  { value: 'other', emoji: '✨' },
];

export const HELP_ROLES: readonly HelpRole[] = ['tank', 'heal', 'dps'];

export const HELP_KIND_EMOJI: Record<HelpKind, string> = { request: '🙋', offer: '🤝' };

/** Miroir de MAX_OPEN_POSTS_PER_USER (backend/src/services/guildHelpService.ts). */
export const MAX_OPEN_POSTS = 5;
export const MAX_CAPACITY = 10;
export const DEFAULT_CAPACITY: Record<HelpKind, number> = { request: 1, offer: 3 };

export function categoryEmoji(category: HelpCategory): string {
  return HELP_CATEGORIES.find((c) => c.value === category)?.emoji ?? '✨';
}

/** Ce que le membre connecté peut faire sur une annonce. */
export type PostState = 'mine' | 'pending' | 'paired' | 'declined' | 'full' | 'open';

export function postState(
  post: HelpPost,
  userId: string | undefined,
  pairs: readonly HelpPair[] = [],
): PostState {
  if (post.author_user_id === userId) return 'mine';
  if (post.my_application_status === 'pending') return 'pending';
  if (post.my_application_status === 'declined') return 'declined';
  // Miroir de HELP_PAIR_EXISTS : un seul binôme actif par couple aidant / aidé
  if (userId && hasActivePairFor(post, userId, pairs)) return 'paired';
  if (isFull(post)) return 'full';
  return 'open';
}

function hasActivePairFor(post: HelpPost, userId: string, pairs: readonly HelpPair[]): boolean {
  const [helper, helped] =
    post.kind === 'request' ? [userId, post.author_user_id] : [post.author_user_id, userId];
  return pairs.some((p) => p.helper_user_id === helper && p.helped_user_id === helped);
}

export function isFull(post: HelpPost): boolean {
  return post.active_pairs >= post.capacity;
}

export function remainingSlots(post: HelpPost): number {
  return Math.max(0, post.capacity - post.active_pairs);
}

export function filterPosts(
  posts: readonly HelpPost[],
  kind: HelpKind,
  category: HelpCategory | null,
): HelpPost[] {
  return posts.filter((p) => p.kind === kind && (!category || p.category === category));
}

/** Nombre d'annonces par catégorie pour un type, dans l'ordre de HELP_CATEGORIES. */
export function countByCategory(
  posts: readonly HelpPost[],
  kind: HelpKind,
): { value: HelpCategory; emoji: string; count: number }[] {
  const counts = new Map<HelpCategory, number>();
  for (const p of posts)
    if (p.kind === kind) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return HELP_CATEGORIES.filter((c) => counts.has(c.value)).map((c) => ({
    ...c,
    count: counts.get(c.value)!,
  }));
}

export interface HelpStats {
  openRequests: number;
  openOffers: number;
  activePairs: number;
  toReview: number;
  myPairs: number;
  myOpenPosts: number;
}

export function helpStats(overview: HelpOverview, userId: string | undefined): HelpStats {
  const { posts, pairs, applications } = overview;
  return {
    openRequests: posts.filter((p) => p.kind === 'request').length,
    openOffers: posts.filter((p) => p.kind === 'offer').length,
    activePairs: pairs.length,
    toReview: applications.length,
    myPairs: pairs.filter((p) => isMyPair(p, userId)).length,
    myOpenPosts: posts.filter((p) => p.author_user_id === userId).length,
  };
}

export function isMyPair(pair: HelpPair, userId: string | undefined): boolean {
  return !!userId && (pair.helper_user_id === userId || pair.helped_user_id === userId);
}

export interface PairMember {
  userId: string;
  battletag: string;
  characterName: string | null;
  characterClass: string | null;
}

export function pairMember(pair: HelpPair, side: 'helper' | 'helped'): PairMember {
  return side === 'helper'
    ? {
        userId: pair.helper_user_id,
        battletag: pair.helper_battletag,
        characterName: pair.helper_character_name,
        characterClass: pair.helper_character_class,
      }
    : {
        userId: pair.helped_user_id,
        battletag: pair.helped_battletag,
        characterName: pair.helped_character_name,
        characterClass: pair.helped_character_class,
      };
}

/** Mon rôle dans le binôme et l'autre membre. */
export function myPairView(
  pair: HelpPair,
  userId: string | undefined,
): { myRole: 'helper' | 'helped'; partner: PairMember } {
  const myRole = pair.helper_user_id === userId ? 'helper' : 'helped';
  return { myRole, partner: pairMember(pair, myRole === 'helper' ? 'helped' : 'helper') };
}

/** Ancienneté du binôme, arrondie à l'unité la plus parlante. */
export function pairAge(
  startedAt: string,
  now: Date = new Date(),
): { unit: 'today' | 'days' | 'weeks' | 'months'; count: number } {
  const days = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 86_400_000);
  if (days < 1) return { unit: 'today', count: 0 };
  if (days < 14) return { unit: 'days', count: days };
  if (days < 60) return { unit: 'weeks', count: Math.floor(days / 7) };
  return { unit: 'months', count: Math.floor(days / 30) };
}

const KNOWN_ERRORS = new Set([
  'HELP_QUOTA_REACHED',
  'HELP_POST_CLOSED',
  'HELP_POST_FULL',
  'HELP_OWN_POST',
  'HELP_ALREADY_APPLIED',
  'HELP_PAIR_EXISTS',
  'HELP_CAPACITY_BELOW_ACTIVE',
  'HELP_POST_NOT_FOUND',
  'HELP_APPLICATION_NOT_PENDING',
]);

/** Clé i18n du message d'erreur d'un appel API, `fallback` pour un code inconnu. */
export function helpErrorKey(error: unknown, fallback: string): string {
  const code = (error as { error?: { code?: unknown } })?.error?.code;
  return typeof code === 'string' && KNOWN_ERRORS.has(code) ? `help.error.${code}` : fallback;
}
