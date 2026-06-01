import { Injectable, signal, computed } from '@angular/core';

export type SupportedLocale = 'fr' | 'en';

const TRANSLATIONS: Record<SupportedLocale, Record<string, string>> = {
  fr: {
    // Navbar
    'nav.dashboard': 'Tableau de bord',
    'nav.calendar': 'Calendrier',
    'nav.roster': 'Rosters',
    'nav.fees': 'Cotisations',
    'nav.login': 'Connexion',
    'nav.logout': 'Déconnexion',
    'nav.admin': 'Administration',
    'nav.options': 'Paramètres',

    // Landing Page
    'landing.hero.title': 'Gérez votre Guilde WoW comme des Pros',
    'landing.hero.subtitle': 'La plateforme SaaS tout-en-un ultime pour gérer vos rosters de raid, organiser vos événements, automatiser le suivi des cotisations, et synchroniser vos personnages en un clic grâce à l\'intégration officielle Battle.net.',
    'landing.hero.cta.start': 'Commencer l\'Aventure',
    'landing.hero.cta.demo': 'Voir les Tarifs',
    
    'landing.feature.sync.title': 'Synchronisation Battle.net SSO',
    'landing.feature.sync.desc': 'Connectez-vous de manière hautement sécurisée avec votre compte Blizzard. Synchronisez instantanément vos personnages, niveaux et classes en temps réel sans saisie manuelle.',
    
    'landing.feature.roster.title': 'Gestionnaires de Rosters Dynamiques',
    'landing.feature.roster.desc': 'Créez et organisez vos compositions de raid. Distribuez vos joueurs par rôles (Tank, Soigneur, DPS) et optimisez votre efficacité pour les raids héroïques et mythiques.',
    
    'landing.feature.calendar.title': 'Calendrier Interactif & Inscriptions',
    'landing.feature.calendar.desc': 'Planifiez vos soirs de raids et donjons mythiques+. Les membres s\'inscrivent en sélectionnant leur rôle, et les officiers peuvent valider ou placer les joueurs en liste d\'attente.',
    
    'landing.feature.fees.title': 'Suivi Intelligent des Cotisations',
    'landing.feature.fees.desc': 'Un livre de comptes transparent pour gérer la trésorerie de votre guilde. Déclarations de dépôts de PO de banque, validations par le trésorier et tableau de présence financière annuel.',

    'landing.pricing.title': 'Un abonnement simple pour votre guilde',
    'landing.pricing.subtitle': 'Pas de frais cachés, annulation en un clic à tout moment.',
    'landing.pricing.card.title': 'Abonnement Guilde Pro',
    'landing.pricing.card.price': '9.99 €',
    'landing.pricing.card.period': '/ mois',
    'landing.pricing.card.feat1': 'Membres et personnages illimités',
    'landing.pricing.card.feat2': 'Calendrier d\'événements complet',
    'landing.pricing.card.feat3': 'Compositions de rosters illimitées',
    'landing.pricing.card.feat4': 'Suivi des cotisations et trésorerie',
    'landing.pricing.card.feat5': 'Synchronisation API Blizzard officielle',
    'landing.pricing.card.feat6': 'Support client réactif 7j/7',
    'landing.pricing.card.cta': 'Activer l\'abonnement pour ma guilde',

    // Select Guild Page
    'select.guild.title': 'Sélectionnez votre Guilde',
    'select.guild.subtitle': 'Choisissez la guilde de votre personnage avec laquelle vous souhaitez vous connecter.',
    'select.guild.no_guilds': 'Aucune guilde détectée.',
    'select.guild.no_guilds_sub': 'Aucun personnage appartenant à une guilde WoW n\'a été détecté sur votre compte Battle.net (niveau 10 minimum).',
    'select.guild.import_cta': 'Aller au gestionnaire de personnages',
    'select.guild.paid_badge': 'Abonnement Actif',
    'select.guild.unpaid_badge': 'Non Abonné',
    'select.guild.btn_connect': 'Se connecter à cette guilde',

    // Payment Page
    'payment.title': 'Activation de l\'abonnement',
    'payment.subtitle': 'Votre guilde n\'a pas encore d\'abonnement actif. Débloquez toutes les fonctionnalités professionnelles de gestion de guilde dès maintenant.',
    'payment.stripe_simulation': 'Simulation de Paiement Stripe',
    'payment.stripe_desc': 'Il s\'agit d\'une simulation complète de l\'environnement Stripe Checkout en mode test.',
    'payment.card_number': 'Numéro de carte',
    'payment.card_placeholder': '4242 4242 4242 4242 (Stripe Test)',
    'payment.btn_pay': 'Procéder au paiement',
    'payment.success': 'Paiement effectué avec succès ! Redirection en cours...',
    'payment.error': 'Erreur lors de la simulation du paiement.',

    // New Translations (FR)
    'login.title': 'Connectez-vous',
    'login.subtitle': 'Gestion de Guilde WoW',
    'login.desc': 'Connectez-vous pour accéder au calendrier des raids, gérer vos personnages et suivre vos performances.',
    'login.btn_bnet': 'Se connecter avec Battle.net',
    'login.redirecting': 'Redirection vers Battle.net...',
    'login.welcome': 'Bonjour',
    'login.btn_dashboard': 'Accéder au Tableau de Bord',
    'login.mock_or': 'OU (MOCK)',
    'login.mock_desc': 'Choisissez un profil de test pour vous connecter instantanément en développement.',
    'login.mock_btn': 'Connexion Rapide',
    'login.incomplete_title': 'Inscription incomplète ⚠️',
    'login.incomplete_desc': 'Il semblerait que vous n\'ayez pas encore sélectionné de guilde ou importé de personnages.',
    'login.btn_resume': 'Sélectionner ma Guilde & Personnages 🚀',
    'login.btn_logout_alt': 'Se déconnecter 🔌',

    'pricing.plan.free': 'Essai Gratuit',
    'pricing.plan.medium': 'Moyen (Standard)',
    'pricing.plan.pro': 'Pro (Tout inclus)',
    'pricing.period.days': '/ 30 jours',
    'pricing.period.months': '/ mois',
    'pricing.feat.sync': 'Synchronisation Battle.net SSO',
    'pricing.feat.roster_limit': 'Limite de 2 Rosters',
    'pricing.feat.event_limit': 'Limite de 6 Événements / mois',
    'pricing.feat.discord_no': 'Intégration Discord Bot',
    'pricing.feat.roster_unlimited': 'Rosters illimités',
    'pricing.feat.event_unlimited': 'Événements illimités',
    'pricing.feat.discord_yes': 'Notifications Discord automatisées',
    'pricing.cta.free': 'Essayer gratuitement',
    'pricing.cta.medium': 'Choisir Standard',
    'pricing.cta.pro': 'Passer au Pro',
    'pricing.popular': 'Populaire',

    'payment.guild_sub': 'Abonnement pour',
    'payment.choose_plan': 'Choisissez votre forfait',
    'payment.select_plan': 'Sélectionnez le niveau d\'abonnement idéal pour votre guilde.',
    'payment.activation_direct': 'Activation Directe',
    'payment.secure_payment': 'Paiement Sécurisé',
    'payment.amount': 'Montant à régler :',
    'payment.btn_activate': 'Activer mon offre',
    'payment.btn_trial': 'Activer mon essai de 30 jours 🎁',
    'payment.free_trial_info': 'Vous êtes sur le point d\'activer 30 jours d\'essai gratuit pour votre guilde. Aucune carte bancaire n\'est requise pour cette offre temporaire.',
    'payment.restricted_title': 'Abonnement de Guilde Requis',
    'payment.restricted_desc': 'Cette guilde n\'a pas d\'abonnement actif pour le moment. Seuls le Maître de Guilde (GM) ou les Officiers sont autorisés à choisir et à activer l\'une des 3 offres d\'abonnement.',
    'payment.restricted_action': 'Veuillez contacter un de vos officiers pour qu\'il procède à l\'activation. En attendant, vous pouvez changer de guilde active ou vous déconnecter :',
    'payment.btn_change_guild': 'Changer de guilde 🏰',
    'payment.btn_logout': 'Se déconnecter 🔌',

    'options.tabs.characters': 'Personnages',
    'options.tabs.settings': 'Paramètres',
    'options.discord.title': 'Lien Discord',
    'options.discord.desc': 'Cliquez sur le bouton ci-dessous pour lier votre compte Discord. Cela vous permettra de recevoir des notifications privées automatiquement.',
    'options.discord.btn_link': 'Se connecter avec Discord',
    'options.discord.secure': 'La liaison est sécurisée et 100% automatique.',
    'options.discord.success_title': 'Compte lié avec succès',
    'options.discord.success_desc': 'Votre ID Discord est enregistré. Vous recevrez désormais vos notifications par MP.',
    'options.discord.btn_unlink': 'Détacher mon compte',
    'options.account.title': 'Informations Compte',
    'options.account.btag': 'BattleTag',
    'options.account.bnet_id': 'ID Battle.net',
    'options.account.status': 'Statut',
    'options.sub.title': 'Abonnement de Guilde',
    'options.sub.guild': 'Guilde',
    'options.sub.plan': 'Forfait',
    'options.sub.expires': 'Échéance',
    'options.sub.status': 'Statut',
    'options.sub.status_active': 'Actif',
    'options.sub.status_expired': 'Expiré / Inactif',
    'options.sub.btn_manage': 'Gérer l\'abonnement ⚙️',
    'options.discord.locked_title': 'Lien Discord Verrouillé',
    'options.discord.locked_desc': 'La liaison Discord personnelle pour recevoir des notifications d\'événements et de cotisations par MP est réservée aux comptes de guilde Pro.',

    'admin.discord.locked_title': 'Intégration Discord Verrouillée',
    'admin.discord.locked_desc': 'Les notifications et rappels Discord automatisés sont réservés aux comptes de guilde Pro. Mettez à niveau votre forfait pour lier votre bot Discord.',
    'admin.discord.btn_unlock': 'Débloquer le Bot 🚀',
    'admin.discord.wizard_title': 'Assistant d\'Installation',
    'admin.discord.wizard_desc': 'Liez votre serveur Discord en 4 étapes faciles',
    'admin.discord.step1_title': 'Inviter le Bot Discord',
    'admin.discord.step1_desc': 'Cliquez sur le bouton ci-dessous pour ajouter le bot officiel à votre serveur avec les permissions requises.',
    'admin.discord.step1_btn': 'Inviter le Bot',
    'admin.discord.step2_title': 'Mode Développeur',
    'admin.discord.step2_desc': 'Dans Discord, allez dans vos Paramètres utilisateur > Avancés, puis cochez l\'option Mode développeur.',
    'admin.discord.step3_title': 'ID du Serveur',
    'admin.discord.step3_desc': 'Faites un clic droit sur le logo de votre serveur Discord tout en haut à gauche, puis cliquez sur "Copier l\'ID". Collez-le dans le champ "ID du Serveur" ci-contre.',
    'admin.discord.step4_title': 'IDs des Salons',
    'admin.discord.step4_desc': 'Faites un clic droit sur vos salons textuels correspondants (ex: #annonces), cliquez sur "Copier l\'ID", puis collez-les dans les salons ci-contre.'
  },
  en: {
    // Navbar
    'nav.dashboard': 'Dashboard',
    'nav.calendar': 'Calendar',
    'nav.roster': 'Rosters',
    'nav.fees': 'Fees Ledger',
    'nav.login': 'Log In',
    'nav.logout': 'Log Out',
    'nav.admin': 'Administration',
    'nav.options': 'Settings',

    // Landing Page
    'landing.hero.title': 'Manage Your WoW Guild Like a Pro',
    'landing.hero.subtitle': 'The ultimate all-in-one SaaS platform to coordinate raid rosters, schedule events, automate fee tracking, and sync characters instantly with official Battle.net integration.',
    'landing.hero.cta.start': 'Get Started',
    'landing.hero.cta.demo': 'View Pricing',
    
    'landing.feature.sync.title': 'Battle.net SSO Synchronization',
    'landing.feature.sync.desc': 'Log in securely using your official Blizzard credentials. Automatically fetch and sync characters, levels, and classes in real-time without tedious manual entry.',
    
    'landing.feature.roster.title': 'Dynamic Roster Management',
    'landing.feature.roster.desc': 'Create and fine-tune your core progression teams. Organize raiders by specific roles (Tank, Healer, DPS) to optimize heroic and mythic roster setups.',
    
    'landing.feature.calendar.title': 'Interactive Event Calendar',
    'landing.feature.calendar.desc': 'Schedule raid nights and Mythic+ runs effortlessly. Members sign up selecting their preferred roles, while leaders easily confirm or bench players.',
    
    'landing.feature.fees.title': 'Smart Guild Bank & Fee Ledger',
    'landing.feature.fees.desc': 'A fully transparent treasury log to track your guild\'s finances. Easily record gold contributions, review auditor validations, and visualize the annual financial report.',

    'landing.pricing.title': 'One simple, flexible plan for your guild',
    'landing.pricing.subtitle': 'No hidden fees, cancel anytime with a single click.',
    'landing.pricing.card.title': 'Guild Pro Subscription',
    'landing.pricing.card.price': '$9.99',
    'landing.pricing.card.period': '/ month',
    'landing.pricing.card.feat1': 'Unlimited members & characters',
    'landing.pricing.card.feat2': 'Full-featured event calendar',
    'landing.pricing.card.feat3': 'Create unlimited progression rosters',
    'landing.pricing.card.feat4': 'Transparent gold ledger & auditing',
    'landing.pricing.card.feat5': 'Official Blizzard API profile sync',
    'landing.pricing.card.feat6': 'Fast 24/7 customer support',
    'landing.pricing.card.cta': 'Activate subscription for my guild',

    // Select Guild Page
    'select.guild.title': 'Choose Your Guild Context',
    'select.guild.subtitle': 'Select which of your characters\' guilds you want to connect with.',
    'select.guild.no_guilds': 'No guilds detected.',
    'select.guild.no_guilds_sub': 'No characters belonging to a WoW guild were detected on your Battle.net account (minimum level 10).',
    'select.guild.import_cta': 'Go to Character Manager',
    'select.guild.paid_badge': 'Active Subscription',
    'select.guild.unpaid_badge': 'Unpaid',
    'select.guild.btn_connect': 'Connect to this guild',

    // Payment Page
    'payment.title': 'Guild Activation Required',
    'payment.subtitle': 'Your guild does not have an active subscription yet. Unlock pro-level guild management features instantly.',
    'payment.stripe_simulation': 'Simulated Stripe Checkout',
    'payment.stripe_desc': 'This is a complete simulation of a real Stripe checkout sandbox flow.',
    'payment.card_number': 'Card details',
    'payment.card_placeholder': '4242 4242 4242 4242 (Stripe Test Card)',
    'payment.btn_pay': 'Complete checkout',
    'payment.success': 'Payment successful! Redirecting you to the dashboard...',
    'payment.error': 'An error occurred during payment simulation.',

    // New Translations (EN)
    'login.title': 'Sign In',
    'login.subtitle': 'WoW Guild Management',
    'login.desc': 'Sign in to access the raid calendar, manage your characters and track your performance.',
    'login.btn_bnet': 'Sign in with Battle.net',
    'login.redirecting': 'Redirecting to Battle.net...',
    'login.welcome': 'Hello',
    'login.btn_dashboard': 'Go to Dashboard',
    'login.mock_or': 'OR (MOCK)',
    'login.mock_desc': 'Choose a test profile to connect instantly in development.',
    'login.mock_btn': 'Quick Login',
    'login.incomplete_title': 'Incomplete Onboarding ⚠️',
    'login.incomplete_desc': 'It seems you haven\'t selected an active guild or imported characters yet.',
    'login.btn_resume': 'Select My Guild & Characters 🚀',
    'login.btn_logout_alt': 'Log out 🔌',

    'pricing.plan.free': 'Free Trial',
    'pricing.plan.medium': 'Medium (Standard)',
    'pricing.plan.pro': 'Pro (All-inclusive)',
    'pricing.period.days': '/ 30 days',
    'pricing.period.months': '/ month',
    'pricing.feat.sync': 'Battle.net SSO Synchronization',
    'pricing.feat.roster_limit': 'Limit of 2 Rosters',
    'pricing.feat.event_limit': 'Limit of 6 Events / month',
    'pricing.feat.discord_no': 'Discord Bot Integration',
    'pricing.feat.roster_unlimited': 'Unlimited Rosters',
    'pricing.feat.event_unlimited': 'Unlimited Events',
    'pricing.feat.discord_yes': 'Automated Discord notifications',
    'pricing.cta.free': 'Try for free',
    'pricing.cta.medium': 'Choose Standard',
    'pricing.cta.pro': 'Go Pro',
    'pricing.popular': 'Popular',

    'payment.guild_sub': 'Subscription for',
    'payment.choose_plan': 'Choose your plan',
    'payment.select_plan': 'Select the subscription level ideal for your guild.',
    'payment.activation_direct': 'Direct Activation',
    'payment.secure_payment': 'Secure Payment',
    'payment.amount': 'Amount to pay:',
    'payment.btn_activate': 'Activate my offer',
    'payment.btn_trial': 'Activate my 30-day trial 🎁',
    'payment.free_trial_info': 'You are about to activate 30 days of free trial for your guild. No credit card is required for this temporary offer.',
    'payment.restricted_title': 'Guild Subscription Required',
    'payment.restricted_desc': 'This guild does not have an active subscription at the moment. Only the Guild Master (GM) or Officers are authorized to choose and activate one of the 3 subscription plans.',
    'payment.restricted_action': 'Please contact one of your officers so they can proceed with activation. In the meantime, you can change your active guild or log out:',
    'payment.btn_change_guild': 'Change guild 🏰',
    'payment.btn_logout': 'Log out 🔌',

    'options.tabs.characters': 'Characters',
    'options.tabs.settings': 'Settings',
    'options.discord.title': 'Discord Link',
    'options.discord.desc': 'Click the button below to link your Discord account. This will allow you to receive private notifications automatically.',
    'options.discord.btn_link': 'Connect with Discord',
    'options.discord.secure': 'The linking is secure and 100% automatic.',
    'options.discord.success_title': 'Account linked successfully',
    'options.discord.success_desc': 'Your Discord ID is registered. You will now receive your notifications via DM.',
    'options.discord.btn_unlink': 'Unlink my account',
    'options.account.title': 'Account Information',
    'options.account.btag': 'BattleTag',
    'options.account.bnet_id': 'Battle.net ID',
    'options.account.status': 'Status',
    'options.sub.title': 'Guild Subscription',
    'options.sub.guild': 'Guild',
    'options.sub.plan': 'Plan',
    'options.sub.expires': 'Expiration',
    'options.sub.status': 'Status',
    'options.sub.status_active': 'Active',
    'options.sub.status_expired': 'Expired / Inactive',
    'options.sub.btn_manage': 'Manage subscription ⚙️',
    'options.discord.locked_title': 'Discord Link Locked',
    'options.discord.locked_desc': 'Personal Discord linking to receive event and fee notifications via DM is reserved for Pro guild accounts.',

    'admin.discord.locked_title': 'Discord Integration Locked',
    'admin.discord.locked_desc': 'Automated Discord notifications and reminders are reserved for Pro guild accounts. Upgrade your plan to link your Discord bot.',
    'admin.discord.btn_unlock': 'Unlock Bot 🚀',
    'admin.discord.wizard_title': 'Installation Wizard',
    'admin.discord.wizard_desc': 'Link your Discord server in 4 easy steps',
    'admin.discord.step1_title': 'Invite Discord Bot',
    'admin.discord.step1_desc': 'Click the button below to add the official bot to your server with the required permissions.',
    'admin.discord.step1_btn': 'Invite Bot',
    'admin.discord.step2_title': 'Developer Mode',
    'admin.discord.step2_desc': 'In Discord, go to User Settings > Advanced, then check the Developer Mode option.',
    'admin.discord.step3_title': 'Server ID',
    'admin.discord.step3_desc': 'Right-click your Discord server logo at the very top left, then click "Copy ID". Paste it into the "Server ID" field.',
    'admin.discord.step4_title': 'Channel IDs',
    'admin.discord.step4_desc': 'Right-click your corresponding text channels (e.g., #announcements), click "Copy ID", then paste them into the fields.'
  }
};

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  currentLocale = signal<SupportedLocale>('fr');

  constructor() {
    // Auto-detect browser language if available
    const saved = localStorage.getItem('unityz_locale') as SupportedLocale;
    if (saved === 'fr' || saved === 'en') {
      this.currentLocale.set(saved);
    } else {
      const browserLang = navigator.language.slice(0, 2);
      if (browserLang === 'en') {
        this.currentLocale.set('en');
      } else {
        this.currentLocale.set('fr'); // Default to French
      }
    }
  }

  setLocale(locale: SupportedLocale) {
    this.currentLocale.set(locale);
    localStorage.setItem('unityz_locale', locale);
  }

  // Reactive translation getter
  t(key: string): string {
    const locale = this.currentLocale();
    return TRANSLATIONS[locale][key] || key;
  }
}
