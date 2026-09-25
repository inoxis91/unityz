import { describe, expect, it } from 'vitest';
import type { HelpOverview, HelpPair, HelpPost } from '../../services/guild-help';
import {
  countByCategory,
  filterPosts,
  helpErrorKey,
  helpStats,
  isFull,
  myPairView,
  pairAge,
  postState,
  remainingSlots,
} from './guild-help-utils';

function post(overrides: Partial<HelpPost> = {}): HelpPost {
  return {
    id: 'p1',
    kind: 'request',
    category: 'mplus',
    target_role: null,
    title: 'Help',
    description: '',
    capacity: 1,
    created_at: '2026-09-01T20:00:00',
    author_user_id: 'author',
    author_battletag: 'Author#1',
    author_character_id: null,
    author_character_name: null,
    author_character_class: null,
    active_pairs: 0,
    pending_count: 0,
    my_application_status: null,
    ...overrides,
  };
}

function pair(overrides: Partial<HelpPair> = {}): HelpPair {
  return {
    id: 'pair1',
    post_id: 'p1',
    post_title: 'Help',
    category: 'raid',
    started_at: '2026-09-01T20:00:00',
    helper_user_id: 'helper',
    helper_battletag: 'Helper#1',
    helper_character_name: 'Helpy',
    helper_character_class: 'Prêtre',
    helped_user_id: 'helped',
    helped_battletag: 'Helped#2',
    helped_character_name: null,
    helped_character_class: null,
    partner_discord_id: null,
    ...overrides,
  };
}

describe('postState', () => {
  it('recognizes the author', () => {
    expect(postState(post(), 'author')).toBe('mine');
  });

  it('reports the member application before the capacity', () => {
    expect(postState(post({ my_application_status: 'pending', active_pairs: 1 }), 'me')).toBe(
      'pending',
    );
    expect(postState(post({ my_application_status: 'declined' }), 'me')).toBe('declined');
  });

  it('reports an existing pair with the author, whatever the capacity', () => {
    const request = post({ kind: 'request', capacity: 3 });
    const iHelpAuthor = pair({ helper_user_id: 'me', helped_user_id: 'author' });
    expect(postState(request, 'me', [iHelpAuthor])).toBe('paired');
    // Sens inverse : l'auteur m'aide déjà, je peux quand même l'aider sur sa demande
    const authorHelpsMe = pair({ helper_user_id: 'author', helped_user_id: 'me' });
    expect(postState(request, 'me', [authorHelpsMe])).toBe('open');
    expect(postState(post({ kind: 'offer' }), 'me', [authorHelpsMe])).toBe('paired');
  });

  it('marks a full post', () => {
    expect(postState(post({ active_pairs: 1, capacity: 1 }), 'me')).toBe('full');
  });

  it('lets a member apply again after withdrawing or once their pair ended', () => {
    expect(postState(post({ my_application_status: 'withdrawn' }), 'me')).toBe('open');
    expect(postState(post({ my_application_status: 'accepted' }), 'me', [])).toBe('open');
  });
});

describe('capacity', () => {
  it('computes remaining slots without going negative', () => {
    expect(remainingSlots(post({ capacity: 3, active_pairs: 1 }))).toBe(2);
    expect(remainingSlots(post({ capacity: 1, active_pairs: 2 }))).toBe(0);
    expect(isFull(post({ capacity: 2, active_pairs: 2 }))).toBe(true);
  });
});

describe('filterPosts / countByCategory', () => {
  const posts = [
    post({ id: 'a', kind: 'request', category: 'raid' }),
    post({ id: 'b', kind: 'request', category: 'mplus' }),
    post({ id: 'c', kind: 'request', category: 'raid' }),
    post({ id: 'd', kind: 'offer', category: 'gold' }),
  ];

  it('filters by kind and optional category', () => {
    expect(filterPosts(posts, 'request', null).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(filterPosts(posts, 'request', 'raid').map((p) => p.id)).toEqual(['a', 'c']);
    expect(filterPosts(posts, 'offer', 'raid')).toEqual([]);
  });

  it('counts categories in the canonical order', () => {
    expect(countByCategory(posts, 'request').map((c) => [c.value, c.count])).toEqual([
      ['mplus', 1],
      ['raid', 2],
    ]);
  });
});

describe('helpStats', () => {
  it('summarizes the overview for the current member', () => {
    const overview: HelpOverview = {
      posts: [
        post({ id: 'a', author_user_id: 'me' }),
        post({ id: 'b', kind: 'offer' }),
        post({ id: 'c', kind: 'offer' }),
      ],
      applications: [
        {
          id: 'x',
          post_id: 'a',
          user_id: 'u',
          battletag: 'U#1',
          character_name: null,
          character_class: null,
          message: '',
          created_at: '',
        },
      ],
      pairs: [pair({ helper_user_id: 'me' }), pair({ id: 'pair2' })],
    };
    expect(helpStats(overview, 'me')).toEqual({
      openRequests: 1,
      openOffers: 2,
      activePairs: 2,
      toReview: 1,
      myPairs: 1,
      myOpenPosts: 1,
    });
  });
});

describe('myPairView', () => {
  it('returns my role and the other member', () => {
    const view = myPairView(pair(), 'helped');
    expect(view.myRole).toBe('helped');
    expect(view.partner).toEqual({
      userId: 'helper',
      battletag: 'Helper#1',
      characterName: 'Helpy',
      characterClass: 'Prêtre',
    });
    expect(myPairView(pair(), 'helper').partner.userId).toBe('helped');
  });
});

describe('pairAge', () => {
  const now = new Date('2026-09-25T12:00:00');

  it('picks the most readable unit', () => {
    expect(pairAge('2026-09-25T08:00:00', now)).toEqual({ unit: 'today', count: 0 });
    expect(pairAge('2026-09-20T12:00:00', now)).toEqual({ unit: 'days', count: 5 });
    expect(pairAge('2026-09-04T12:00:00', now)).toEqual({ unit: 'weeks', count: 3 });
    expect(pairAge('2026-06-01T12:00:00', now)).toEqual({ unit: 'months', count: 3 });
  });
});

describe('helpErrorKey', () => {
  it('maps known API codes and falls back otherwise', () => {
    expect(helpErrorKey({ error: { code: 'HELP_POST_FULL' } }, 'fallback')).toBe(
      'help.error.HELP_POST_FULL',
    );
    expect(helpErrorKey({ error: { code: 'GUILD_UNPAID' } }, 'fallback')).toBe('fallback');
    expect(helpErrorKey(new Error('network'), 'fallback')).toBe('fallback');
  });
});
