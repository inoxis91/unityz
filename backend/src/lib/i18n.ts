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

    // Raid line-up (MP au joueur)
    'discord.lineup.selected': '✅ **Tu es validé(e) pour le raid !**',
    'discord.lineup.benched': '🪑 **Tu es sur le banc pour ce raid.**',
    'discord.lineup.pending': '⏳ **Ta sélection pour ce raid est de nouveau en attente.**',
    'discord.lineup.role_changed': '🔄 **Ton rôle pour ce raid a été modifié.**',
    'discord.lineup.event_line': '⚔️ **{eventTitle}** — {date} à {time}',
    'discord.lineup.character_role_line': '🎯 Personnage : **{character}** · Rôle : **{role}**',
    'discord.lineup.role_line': '🎯 Rôle : **{role}**',
    'discord.lineup.benched_outro': 'Reste disponible : tu peux être appelé(e) en renfort à tout moment. 🙏',
    'discord.lineup.link': '🔗 Détails : {link}',
    'discord.lineup.role.tank': 'Tank',
    'discord.lineup.role.heal': 'Heal',
    'discord.lineup.role.dps': 'DPS',

    // Craft Service
    'discord.craft.title': '🛠️ **NOUVELLE DEMANDE DE CRAFT !**',
    'discord.craft.body': '**{requesterText}** a besoin d\'un artisan ! 🚀',
    'discord.craft.item_label': '• **Objet / Emplacement :** {slot}',
    'discord.craft.type_label': '• **Type d\'armure / arme :** {type}',
    'discord.craft.footer': '_Répondez à cette demande directement sur le site de la guilde !_',
    'discord.craft.no_char': 'Sans Personnage',
    'discord.craft.dm_title': '🛠️ **BESOIN DE TON MÉTIER POUR UN CRAFT !**',
    'discord.craft.dm_body': 'Bonjour ! Une demande de craft correspondant à l\'un de tes métiers a été faite dans la guilde. 🚀',

    // Entraide
    'discord.help.new_request_title': '🆘 **NOUVELLE DEMANDE D\'ENTRAIDE**',
    'discord.help.new_offer_title': '🤝 **NOUVELLE OFFRE D\'ENTRAIDE**',
    'discord.help.author_line': '**{author}** · {category}',
    'discord.help.title_line': '📌 {title}',
    'discord.help.role_line': '🎯 Rôle : **{role}**',
    'discord.help.capacity_line': '👥 Places : **{capacity}**',
    'discord.help.cta_request': '🔗 Proposer ton aide : {link}',
    'discord.help.cta_offer': '🔗 S\'inscrire : {link}',
    'discord.help.applied_request': '🤝 **{applicant}** propose son aide pour ta demande « {title} » !',
    'discord.help.applied_offer': '🙋 **{applicant}** souhaite profiter de ton offre d\'aide « {title} » !',
    'discord.help.message_line': '💬 « {message} »',
    'discord.help.review_link': '🔗 Accepter ou refuser : {link}',
    'discord.help.accepted_request': '✅ **{author}** a accepté ton aide pour « {title} » : vous formez désormais un binôme !',
    'discord.help.accepted_offer': '✅ **{author}** a accepté ton inscription à son offre « {title} » : vous formez désormais un binôme !',
    'discord.help.pair_link': '🔗 Voir ton binôme : {link}',
    'discord.help.category.mplus': 'Mythique+',
    'discord.help.category.raid': 'Raid',
    'discord.help.category.class': 'Classe & spé',
    'discord.help.category.gear': 'Équipement',
    'discord.help.category.professions': 'Métiers',
    'discord.help.category.gold': 'Or & économie',
    'discord.help.category.other': 'Autre',

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
    'armor.twohanded': 'Arme 2 mains',

    // New keys for fee notification compliance
    'discord.fees.dm.approved': '✅ Votre paiement de **{amount} PO** a été approuvé !\nPériode : **{duration} mois** (à partir de **{date}**)',
    'discord.fees.dm.rejected': '❌ Votre paiement de **{amount} PO** a été rejeté.\nPériode : **{duration} mois** (à partir de **{date}**)\nMotif : {reason}',
    'discord.fees.dm.unspecified_reason': 'Non spécifié',
    // Fin d'essai gratuit (DM aux GM / officiers) et digest du back-office
    'discord.trial_end.message': '⏳ **L\'essai gratuit de {guild} est terminé.**\nMerci d\'avoir testé Guild Manager ! Pour continuer, choisissez une offre : {url}\n\nVous ne souhaitez pas continuer ? Dites-nous en une minute ce qui vous a manqué, ça nous aide énormément : {feedbackUrl}',
    'discord.digest.title': '📊 **Guild Manager, dernières 24 h**',
    'discord.digest.body': '👤 Nouveaux comptes : **{newUsers}** · 🏰 Nouvelles guildes : **{newGuilds}**\n🎁 Essais activés : **{trials}** · 💳 Abonnements : **{subscriptions}** · 🛒 Paniers abandonnés : **{abandoned}**\n⚠️ Échecs de paiement : **{paymentFailures}** · ❌ Résiliations : **{cancellations}** · 💬 Retours : **{feedback}**\n💶 Encaissé : **{revenue}** · MRR : **{mrr}** ({paying} guildes payantes) · Actifs hier : **{activeUsers}**\n{url}',
    'discord.fees.reminder.message': '**Rappel de Cotisation** ⏰\nLes membres suivants ne sont pas encore à jour pour ce mois (Minimum requis : {minAmount} PO) : {mentions}.\n\nVeuillez d\'abord déposer vos pièces d\'or en banque de guilde puis déclarer votre dépôt sur le site !'
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

    // Raid line-up (DM to the player)
    'discord.lineup.selected': '✅ **You have been selected for the raid!**',
    'discord.lineup.benched': '🪑 **You are on the bench for this raid.**',
    'discord.lineup.pending': '⏳ **Your raid selection is pending again.**',
    'discord.lineup.role_changed': '🔄 **Your role for this raid has changed.**',
    'discord.lineup.event_line': '⚔️ **{eventTitle}** — {date} at {time}',
    'discord.lineup.character_role_line': '🎯 Character: **{character}** · Role: **{role}**',
    'discord.lineup.role_line': '🎯 Role: **{role}**',
    'discord.lineup.benched_outro': 'Please stay available: you may be called in as a replacement at any time. 🙏',
    'discord.lineup.link': '🔗 Details: {link}',
    'discord.lineup.role.tank': 'Tank',
    'discord.lineup.role.heal': 'Healer',
    'discord.lineup.role.dps': 'DPS',

    // Craft Service
    'discord.craft.title': '🛠️ **NEW CRAFT REQUEST!**',
    'discord.craft.body': '**{requesterText}** needs a crafter! 🚀',
    'discord.craft.item_label': '• **Item / Slot:** {slot}',
    'discord.craft.type_label': '• **Armor / Weapon Type:** {type}',
    'discord.craft.footer': '_Reply to this request directly on the guild website!_',
    'discord.craft.no_char': 'No Character',
    'discord.craft.dm_title': '🛠️ **CRAFT REQUEST FOR YOUR PROFESSION!**',
    'discord.craft.dm_body': 'Hello! A craft request matching one of your professions has been submitted in the guild. 🚀',

    // Guild help
    'discord.help.new_request_title': '🆘 **NEW GUILD HELP REQUEST**',
    'discord.help.new_offer_title': '🤝 **NEW GUILD HELP OFFER**',
    'discord.help.author_line': '**{author}** · {category}',
    'discord.help.title_line': '📌 {title}',
    'discord.help.role_line': '🎯 Role: **{role}**',
    'discord.help.capacity_line': '👥 Spots: **{capacity}**',
    'discord.help.cta_request': '🔗 Offer your help: {link}',
    'discord.help.cta_offer': '🔗 Sign up: {link}',
    'discord.help.applied_request': '🤝 **{applicant}** offers to help with your request "{title}"!',
    'discord.help.applied_offer': '🙋 **{applicant}** would like to join your help offer "{title}"!',
    'discord.help.message_line': '💬 "{message}"',
    'discord.help.review_link': '🔗 Accept or decline: {link}',
    'discord.help.accepted_request': '✅ **{author}** accepted your help for "{title}": you are now a pair!',
    'discord.help.accepted_offer': '✅ **{author}** accepted you on their offer "{title}": you are now a pair!',
    'discord.help.pair_link': '🔗 See your pair: {link}',
    'discord.help.category.mplus': 'Mythic+',
    'discord.help.category.raid': 'Raid',
    'discord.help.category.class': 'Class & spec',
    'discord.help.category.gear': 'Gear',
    'discord.help.category.professions': 'Professions',
    'discord.help.category.gold': 'Gold & economy',
    'discord.help.category.other': 'Other',

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
    'armor.twohanded': 'Two-Handed Weapon',

    // New keys for fee notification compliance
    'discord.fees.dm.approved': '✅ Your payment of **{amount} Gold** has been approved!\nPeriod: **{duration} months** (starting **{date}**)',
    'discord.fees.dm.rejected': '❌ Your payment of **{amount} Gold** has been rejected.\nPeriod: **{duration} months** (starting **{date}**)\nReason: {reason}',
    'discord.fees.dm.unspecified_reason': 'Unspecified',
    // Free trial end (DM to GMs / officers) and back-office digest
    'discord.trial_end.message': '⏳ **The free trial of {guild} has ended.**\nThanks for trying Guild Manager! To keep going, pick a plan: {url}\n\nNot continuing? Tell us in one minute what was missing, it helps a lot: {feedbackUrl}',
    'discord.digest.title': '📊 **Guild Manager, last 24 h**',
    'discord.digest.body': '👤 New accounts: **{newUsers}** · 🏰 New guilds: **{newGuilds}**\n🎁 Trials: **{trials}** · 💳 Subscriptions: **{subscriptions}** · 🛒 Abandoned checkouts: **{abandoned}**\n⚠️ Payment failures: **{paymentFailures}** · ❌ Cancellations: **{cancellations}** · 💬 Feedback: **{feedback}**\n💶 Collected: **{revenue}** · MRR: **{mrr}** ({paying} paying guilds) · Active yesterday: **{activeUsers}**\n{url}',
    'discord.fees.reminder.message': '**Membership Fee Reminder** ⏰\nThe following members are not up to date for this month (Minimum required: {minAmount} Gold): {mentions}.\n\nPlease deposit your gold in the guild bank first, then declare your deposit on the website!'
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
