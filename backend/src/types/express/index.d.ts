declare global {
  namespace Express {
    interface User {
      id: string;
      bnet_id: number;
      battletag: string;
      discord_id?: string | null;
      access_token: string | null;
      role: string;
      rank?: number | null;
      active_guild_id?: string | null;
      created_at: Date;
      updated_at: Date;
    }
  }
}

export {};
