export type SupportedDiscordLocale = 'fr' | 'en';

const TRANSLATIONS: Record<SupportedDiscordLocale, Record<string, string>> = {
  fr: {
    // Event Service
    'discord.event.new_title': '🆕 **NOUVEL ÉVÉNEMENT CRÉÉ !**',
    'discord.event.new_reunion': '📅 **NOUVELLE RÉUNION PLANIFIÉE !**',
    'discord.event.new_private_reunion': '🔒 **NOUVELLE RÉUNION PRIVÉE !**',
    'discord.event.intro': 'Venez nombreux vous inscrire pour faire briller la guilde ! 🚀',
    'discord.event.outro': 'On compte sur vous ! 🔥',
    'discord.event.roster_all': '🟢 **INVITATION : TOUS LES MEMBRES** 🟢',
    'discord.event.roster_private': '🔒 **RÉUNION PRIVÉE - INVITÉS : {roles}** 🔒',
    'discord.event.roster_open_all': '🟢 **OUVERT À TOUS** 🟢',
    'discord.event.roster_tag': '🔴 **ROSTER : {rosterName}** 🔴',
    'discord.event.label_date': '📅 Date',
    'discord.event.label_time': '⏰ Heure',
    'discord.event.label_type': '📝 Type',
    'discord.event.label_description': '📖 Description',
    'discord.event.label_register_here': '🔗 **S\'inscrire ici :**',
    'discord.event.label_link': '🔗 **Lien :**',
    'discord.event.label_maybe_reminder': '⚠️ **Rappel aux "Peut-être" :**',
    'discord.event.label_maybe_outro': 'Merci de confirmer votre présence dès que possible ! 🙏',
    'discord.event.label_register_reminder_outro': 'N\'oubliez pas de vous inscrire sur le site ! 🚀',
    'discord.event.label_daily_events_title': '📅 **ÉVÉNEMENTS DU JOUR**',
    'discord.event.label_reunion': 'Réunion',
    'discord.event.label_manual_reminder': '📣 **RAPPEL D\'ÉVÉNEMENT**',
    'discord.event.canceled_title': '🚨 **ÉVÉNEMENT ANNULÉ** 🚨',
    'discord.event.canceled_body': 'L\'événement **{eventTitle}** prévu le {date} à {time} a été annulé.',
    'discord.event.canceled_reason': '• **Motif d\'annulation :** {reason}',

    // Craft Service
    'discord.craft.title': '🛠️ **NOUVELLE DEMANDE DE CRAFT !**',
    'discord.craft.body': '**{requesterText}** a besoin d\'un artisan ! 🚀',
    'discord.craft.item_label': '• **Objet / Emplacement :** {slot}',
    'discord.craft.type_label': '• **Type d\'armure / arme :** {type}',
    'discord.craft.footer': '_Répondez à cette demande directement sur le site de la guilde !_',
    'discord.craft.no_char': 'Sans Personnage',

    // Fees Service
    'discord.fees.embed_title': 'Nouvelle Déclaration de Cotisation',
    'discord.fees.label_member': 'Membre',
    'discord.fees.label_total_amount': 'Montant Total',
    'discord.fees.label_period': 'Périodicité',
    'discord.fees.label_period_value': '{months} mois (dès {date})',
    'discord.fees.label_characters': 'Personnages',
    'discord.fees.label_comment': 'Commentaire',
    'discord.fees.no_char': 'Aucun personnage synchronisé',

    // Craft slots & armor types
    'slot.head': 'Tête',
    'slot.neck': 'Cou',
    'slot.shoulders': 'Épaules',
    'slot.back': 'Dos',
    'slot.chest': 'Torse',
    'slot.wrists': 'Poignets',
    'slot.hands': 'Mains',
    'slot.waist': 'Taille',
    'slot.legs': 'Jambes',
    'slot.feet': 'Pieds',
    'slot.finger': 'Anneau',
    'slot.trinket': 'Bijou',
    'slot.weapon': 'Arme',
    'slot.offhand': 'Bouclier & Main gauche',

    'armor.cloth': 'Tissu',
    'armor.leather': 'Cuir',
    'armor.mail': 'Mailles',
    'armor.plate': 'Plaques',
    'armor.other': 'Autre / Divers',
    'armor.wand': 'Baguette',
    'armor.staff': 'Bâton',
    'armor.onehanded': 'Arme 1 main',
    'armor.twohanded': 'Arme 2 mains'
  },
  en: {
    // Event Service
    'discord.event.new_title': '🆕 **NEW EVENT CREATED!**',
    'discord.event.new_reunion': '📅 **NEW MEETING SCHEDULED!**',
    'discord.event.new_private_reunion': '🔒 **NEW PRIVATE MEETING!**',
    'discord.event.intro': 'Sign up now to help the guild shine! 🚀',
    'discord.event.outro': 'We count on you! 🔥',
    'discord.event.roster_all': '🟢 **INVITATION: ALL MEMBERS** 🟢',
    'discord.event.roster_private': '🔒 **PRIVATE MEETING - INVITED: {roles}** 🔒',
    'discord.event.roster_open_all': '🟢 **OPEN TO ALL** 🟢',
    'discord.event.roster_tag': '🔴 **ROSTER: {rosterName}** 🔴',
    'discord.event.label_date': '📅 Date',
    'discord.event.label_time': '⏰ Time',
    'discord.event.label_type': '📝 Type',
    'discord.event.label_description': '📖 Description',
    'discord.event.label_register_here': '🔗 **Sign up here:**',
    'discord.event.label_link': '🔗 **Link:**',
    'discord.event.label_maybe_reminder': '⚠️ **Reminder to "Maybe"s:**',
    'discord.event.label_maybe_outro': 'Please confirm your status as soon as possible! 🙏',
    'discord.event.label_register_reminder_outro': 'Don\'t forget to sign up on the website! 🚀',
    'discord.event.label_daily_events_title': '📅 **TODAY\'S EVENTS**',
    'discord.event.label_reunion': 'Meeting',
    'discord.event.label_manual_reminder': '📣 **EVENT REMINDER**',
    'discord.event.canceled_title': '🚨 **EVENT CANCELED** 🚨',
    'discord.event.canceled_body': 'The event **{eventTitle}** scheduled for {date} at {time} has been canceled.',
    'discord.event.canceled_reason': '• **Reason for cancellation:** {reason}',

    // Craft Service
    'discord.craft.title': '🛠️ **NEW CRAFT REQUEST!**',
    'discord.craft.body': '**{requesterText}** needs a crafter! 🚀',
    'discord.craft.item_label': '• **Item / Slot:** {slot}',
    'discord.craft.type_label': '• **Armor / Weapon Type:** {type}',
    'discord.craft.footer': '_Reply to this request directly on the guild website!_',
    'discord.craft.no_char': 'No Character',

    // Fees Service
    'discord.fees.embed_title': 'New Membership Fee Declaration',
    'discord.fees.label_member': 'Member',
    'discord.fees.label_total_amount': 'Total Amount',
    'discord.fees.label_period': 'Period',
    'discord.fees.label_period_value': '{months} months (starting {date})',
    'discord.fees.label_characters': 'Characters',
    'discord.fees.label_comment': 'Comment',
    'discord.fees.no_char': 'No synchronized characters',

    // Craft slots & armor types
    'slot.head': 'Head',
    'slot.neck': 'Neck',
    'slot.shoulders': 'Shoulders',
    'slot.back': 'Back',
    'slot.chest': 'Chest',
    'slot.wrists': 'Wrists',
    'slot.hands': 'Hands',
    'slot.waist': 'Waist',
    'slot.legs': 'Legs',
    'slot.feet': 'Feet',
    'slot.finger': 'Finger',
    'slot.trinket': 'Trinket',
    'slot.weapon': 'Weapon',
    'slot.offhand': 'Shield & Off-hand',

    'armor.cloth': 'Cloth',
    'armor.leather': 'Leather',
    'armor.mail': 'Mail',
    'armor.plate': 'Plate',
    'armor.other': 'Other / Misc',
    'armor.wand': 'Wand',
    'armor.staff': 'Staff',
    'armor.onehanded': 'One-Handed Weapon',
    'armor.twohanded': 'Two-Handed Weapon'
  }
};

export const getDiscordLocale = (guild: any): SupportedDiscordLocale => {
  if (guild && (guild.discord_locale === 'fr' || guild.discord_locale === 'en')) {
    return guild.discord_locale;
  }
  return 'en'; // Default to English
};

export const t = (locale: SupportedDiscordLocale, key: string, params?: Record<string, string>): string => {
  let text = TRANSLATIONS[locale]?.[key] || TRANSLATIONS['en']?.[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.split(`{${k}}`).join(v);
    });
  }
  return text;
};
