import { Client, Events, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
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

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, declarationId] = interaction.customId.split('_');

    if (action === 'approveFee' || action === 'rejectFee') {
      // Check if user has permission (optional, but good practice. For now we assume if they can click in the channel, they can manage)
      // They could also just be officers.

      try {
        await interaction.deferReply({ ephemeral: true });
        
        const status = action === 'approveFee' ? 'accepted' : 'rejected';
        const adminComment = action === 'rejectFee' ? 'Refusé via Discord' : null;
        
        await FeeService.resolveDeclaration(declarationId, status, adminComment);
        
        // Update the original message to remove buttons and show status
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed)
          .setColor(status === 'accepted' ? 0x00FF00 : 0xFF0000)
          .setTitle(`${originalEmbed.title} - ${status === 'accepted' ? '✅ APPROUVÉ' : '❌ REFUSÉ'}`)
          .setFooter({ text: `Traité par ${interaction.user.username}` });

        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
        await interaction.editReply(`La déclaration a été **${status === 'accepted' ? 'approuvée' : 'refusée'}**.`);

      } catch (error: any) {
        console.error('Error resolving fee via Discord:', error);
        await interaction.editReply(`Erreur lors du traitement: ${error.message}`);
      }
    }
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

export const sendFeeDeclarationNotification = async (declaration: any, userDetails: { battletag: string, mainCharacter: string, characters: any[] }) => {
  try {
    const channelId = process.env.DISCORD_FEES_CHANNEL_ID;
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

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`approveFee_${declaration.id}`)
          .setLabel('Approuver')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`rejectFee_${declaration.id}`)
          .setLabel('Refuser')
          .setStyle(ButtonStyle.Danger),
      );

    await channel.send({ embeds: [embed], components: [row] });
    return true;

  } catch (error) {
    console.error('Failed to send fee declaration notification:', error);
    return false;
  }
};

export default client;
