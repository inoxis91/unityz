import { Client, Events, GatewayIntentBits, EmbedBuilder, TextChannel } from 'discord.js';
import dotenv from 'dotenv';
import { FeeService } from '../services/feeService';

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

export const findMemberByName = async (name: string, discordGuildId?: string) => {
  try {
    const guildId = discordGuildId || process.env.DISCORD_GUILD_ID;
    if (!guildId) return null;

    const guild = await client.guilds.fetch(guildId);
    await guild.members.fetch(); 
    
    const searchName = name.toLowerCase().trim();
    
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

export const sendDiscordChannelMessageWithResult = async (channelId: string, message: string): Promise<string | null> => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      const sentMessage = await (channel as any).send(message);
      return sentMessage.id;
    }
  } catch (error) {
    console.error(`Failed to send Discord message with result to channel ${channelId}:`, error);
  }
  return null;
};

export const reactToDiscordMessage = async (channelId: string, messageId: string, emoji: string): Promise<boolean> => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      const message = await (channel as any).messages.fetch(messageId);
      if (message) {
        await message.react(emoji);
        return true;
      }
    }
  } catch (error) {
    console.error(`Failed to react to Discord message ${messageId} in channel ${channelId}:`, error);
  }
  return false;
};

export const sendFeeDeclarationNotification = async (declaration: any, userDetails: { battletag: string, mainCharacter: string, characters: any[] }, discordFeesChannelId?: string) => {
  try {
    const channelId = discordFeesChannelId || process.env.DISCORD_FEES_CHANNEL_ID;
    if (!channelId) {
      console.warn('DISCORD_FEES_CHANNEL_ID not set, skipping fee notification');
      return false;
    }

    const channel = await client.channels.fetch(channelId) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      console.error(`Channel ${channelId} not found or is not a text channel.`);
      return false;
    }

    let charsList = userDetails.characters && userDetails.characters.length > 0 
      ? userDetails.characters.map(c => `- ${c.name} (${c.class} - ${c.realm})${c.is_main ? ' **[MAIN]**' : ''}`).join('\n')
      : 'Aucun personnage synchronisé';

    const embed = new EmbedBuilder()
      .setTitle('Nouvelle Déclaration de Cotisation')
      .setColor(0xFFA500) // Orange
      .addFields(
        { name: 'Membre', value: `${userDetails.mainCharacter || userDetails.battletag}\n(${userDetails.battletag})`, inline: true },
        { name: 'Montant Total', value: `${declaration.amount} PO`, inline: true },
        { name: 'Périodicité', value: `${declaration.duration_months} mois (dès ${new Date(declaration.start_month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})`, inline: false },
        { name: 'Personnages', value: charsList, inline: false }
      )
      .setTimestamp();

    if (declaration.comment) {
      embed.addFields({ name: 'Commentaire', value: `"${declaration.comment}"`, inline: false });
    }

    await channel.send({ embeds: [embed] });
    return true;

  } catch (error) {
    console.error('Failed to send fee declaration notification:', error);
    return false;
  }
};

export default client;
