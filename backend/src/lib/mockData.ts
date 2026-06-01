export const mockGuilds = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    blizzard_id: 1001,
    name: 'Unpaid Guild',
    realm: 'Hyjal',
    region: 'eu',
    subscription_tier: 'none',
    subscription_expires_at: null,
    discord_enabled: false
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    blizzard_id: 1002,
    name: 'Pro Guild',
    realm: 'Archimonde',
    region: 'eu',
    subscription_tier: 'pro',
    subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    discord_enabled: true
  }
];

export const mockUsers = [
  {
    id: 'mock_user_1',
    bnet_id: 9001,
    battletag: 'GuildMaster#1234',
    role: 'admin',
    rank: 0,
    active_guild_id: null,
    label: 'GM (Maître de Guilde) - Guilde non abonnée'
  },
  {
    id: 'mock_user_2',
    bnet_id: 9002,
    battletag: 'Officer#5678',
    role: 'raid_leader',
    rank: 1,
    active_guild_id: null,
    label: 'Officier (Raid Leader) - Guilde Pro'
  },
  {
    id: 'mock_user_3',
    bnet_id: 9003,
    battletag: 'Member#9012',
    role: 'member',
    rank: 4,
    active_guild_id: null,
    label: 'Membre - Guilde Pro'
  },
  {
    id: 'mock_user_4',
    bnet_id: 9004,
    battletag: 'SoloPlayer#3456',
    role: 'member',
    rank: null,
    active_guild_id: null,
    label: 'Joueur Sans Guilde'
  },
  {
    id: 'mock_user_5',
    bnet_id: 9005,
    battletag: 'RegularMember#4321',
    role: 'member',
    rank: 4,
    active_guild_id: null,
    label: 'Membre Simple (5 persos) - Guilde Pro'
  }
];

export const mockCharacters = [
  // User 1 characters (Hyjal)
  {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: 'mock_user_1',
    guild_id: '11111111-1111-4111-8111-111111111111',
    name: 'GMWarrior',
    realm: 'Hyjal',
    class: 'Warrior',
    level: 70,
    is_tank: true,
    is_main: true
  },
  {
    id: '33333333-3333-4333-8333-333333333334',
    user_id: 'mock_user_1',
    guild_id: '11111111-1111-4111-8111-111111111111',
    name: 'GMDruid',
    realm: 'Hyjal',
    class: 'Druid',
    level: 70,
    is_heal: true,
    is_main: false
  },
  {
    id: '33333333-3333-4333-8333-333333333335',
    user_id: 'mock_user_1',
    guild_id: '11111111-1111-4111-8111-111111111111',
    name: 'GMDemonHunter',
    realm: 'Hyjal',
    class: 'Demon Hunter',
    level: 68,
    is_dps: true,
    is_main: false
  },

  // User 2 characters (Archimonde)
  {
    id: '44444444-4444-4444-8444-444444444444',
    user_id: 'mock_user_2',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'OffiPriest',
    realm: 'Archimonde',
    class: 'Priest',
    level: 70,
    is_heal: true,
    is_main: true
  },
  {
    id: '44444444-4444-4444-8444-444444444445',
    user_id: 'mock_user_2',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'OffiPaladin',
    realm: 'Archimonde',
    class: 'Paladin',
    level: 70,
    is_tank: true,
    is_main: false
  },
  {
    id: '44444444-4444-4444-8444-444444444446',
    user_id: 'mock_user_2',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'OffiHunter',
    realm: 'Archimonde',
    class: 'Hunter',
    level: 65,
    is_dps: true,
    is_main: false
  },

  // User 3 characters (Archimonde)
  {
    id: '55555555-5555-4555-8555-555555555555',
    user_id: 'mock_user_3',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'MembRogue',
    realm: 'Archimonde',
    class: 'Rogue',
    level: 70,
    is_dps: true,
    is_main: true
  },
  {
    id: '55555555-5555-4555-8555-555555555556',
    user_id: 'mock_user_3',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'MembDk',
    realm: 'Archimonde',
    class: 'Death Knight',
    level: 70,
    is_tank: true,
    is_main: false
  },
  {
    id: '55555555-5555-4555-8555-555555555557',
    user_id: 'mock_user_3',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'MembMage',
    realm: 'Archimonde',
    class: 'Mage',
    level: 62,
    is_dps: true,
    is_main: false
  },

  // User 4 characters (Ysondre)
  {
    id: '66666666-6666-4666-8666-666666666666',
    user_id: 'mock_user_4',
    guild_id: null,
    name: 'SoloMage',
    realm: 'Ysondre',
    class: 'Mage',
    level: 70,
    is_dps: true,
    is_main: true
  },
  {
    id: '66666666-6666-4666-8666-666666666667',
    user_id: 'mock_user_4',
    guild_id: null,
    name: 'SoloWarlock',
    realm: 'Ysondre',
    class: 'Warlock',
    level: 64,
    is_dps: true,
    is_main: false
  },
  {
    id: '66666666-6666-4666-8666-666666666668',
    user_id: 'mock_user_4',
    guild_id: null,
    name: 'SoloShaman',
    realm: 'Ysondre',
    class: 'Shaman',
    level: 60,
    is_heal: true,
    is_main: false
  },

  // User 5 characters (Archimonde)
  {
    id: '77777777-7777-4777-8777-777777777771',
    user_id: 'mock_user_5',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'RegWarrior',
    realm: 'Archimonde',
    class: 'Warrior',
    level: 70,
    is_tank: true,
    is_main: true
  },
  {
    id: '77777777-7777-4777-8777-777777777772',
    user_id: 'mock_user_5',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'RegPriest',
    realm: 'Archimonde',
    class: 'Priest',
    level: 70,
    is_heal: true,
    is_main: false
  },
  {
    id: '77777777-7777-4777-8777-777777777773',
    user_id: 'mock_user_5',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'RegHunter',
    realm: 'Archimonde',
    class: 'Hunter',
    level: 70,
    is_dps: true,
    is_main: false
  },
  {
    id: '77777777-7777-4777-8777-777777777774',
    user_id: 'mock_user_5',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'RegMage',
    realm: 'Archimonde',
    class: 'Mage',
    level: 68,
    is_dps: true,
    is_main: false
  },
  {
    id: '77777777-7777-4777-8777-777777777775',
    user_id: 'mock_user_5',
    guild_id: '22222222-2222-4222-8222-222222222222',
    name: 'RegDruid',
    realm: 'Archimonde',
    class: 'Druid',
    level: 64,
    is_dps: true,
    is_main: false
  }
];
