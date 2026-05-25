import { Client, Events, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ] 
});

export const initDiscord = () => {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.warn('DISCORD_TOKEN not found. Discord integration disabled.');
    return;
  }

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Discord Bot logged in as ${readyClient.user.tag}`);
  });

  client.login(token).catch(err => {
    console.error('Failed to login to Discord:', err);
  });
};

export const findMemberByName = async (name: string) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) return null;

    const guild = await client.guilds.fetch(guildId);
    await guild.members.fetch(); 
    
    const searchName = name.toLowerCase().trim();
    
    // On cherche dans les pseudos, les usernames et les noms d'affichage
    const member = guild.members.cache.find(m => 
      m.nickname?.toLowerCase() === searchName || 
      m.user.username.toLowerCase() === searchName ||
      m.user.globalName?.toLowerCase() === searchName
    );

    return member?.id || null;
  } catch (error) {
    console.error(`Error searching Discord member for ${name}:`, error);
    return null;
  }
};

export const sendDiscordDM = async (discordId: string, message: string) => {
  try {
    const user = await client.users.fetch(discordId);
    if (user) {
      await user.send(message);
      return true;
    }
  } catch (error) {
    console.error(`Failed to send Discord DM to ${discordId}:`, error);
  }
  return false;
};

export const sendDiscordChannelMessage = async (channelId: string, message: string) => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await (channel as any).send(message);
      return true;
    }
  } catch (error) {
    console.error(`Failed to send Discord message to channel ${channelId}:`, error);
  }
  return false;
};

export default client;
