declare global {
  namespace Express {
    interface User {
      id: string;
      bnet_id: number;
      battletag: string;
      access_token: string | null;
      is_admin: boolean;
      rank?: number | null;
      created_at: Date;
      updated_at: Date;
    }
  }
}

export {};
