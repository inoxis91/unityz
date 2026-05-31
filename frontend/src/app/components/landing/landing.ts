import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css']
})
export class LandingComponent {
  
  features = [
    {
      icon: '🛡️',
      title: 'Synchronisation Battle.net',
      description: 'Importez vos personnages, vos rerolls et vos rôles automatiquement depuis les serveurs officiels. Finies les mises à jour manuelles fastidieuses.'
    },
    {
      icon: '📅',
      title: 'Calendrier Avancé',
      description: 'Planifiez vos raids, gérez les présences et constituez vos rosters avec une visibilité parfaite sur les compos et les rôles disponibles.'
    },
    {
      icon: '🤖',
      title: 'Intégration Discord',
      description: 'Recevez des notifications automatiques pour vos nouveaux événements et des rappels directement sur votre serveur Discord pour maximiser la présence.'
    },
    {
      icon: '📈',
      title: 'Suivi Raider.IO',
      description: 'Visualisez instantanément le score Mythique+ de vos membres pour optimiser la création de vos groupes et suivre la progression.'
    },
    {
      icon: '💰',
      title: 'Gestion de Banque & Cotisations',
      description: 'Gardez un œil sur l\'économie de votre guilde. Gérez les cotisations hebdomadaires ou mensuelles avec un historique transparent.'
    },
    {
      icon: '👑',
      title: 'Outils d\'Officier',
      description: 'Attribution des grades, gestion des accès, et bientôt suivi du taux de présence et gestion des priorités de loot (BiS list).'
    }
  ];

  plans = [
    {
      name: 'Starter',
      price: 'Gratuit',
      period: 'pour toujours',
      description: 'Idéal pour les petites guildes qui démarrent.',
      features: ['Jusqu\'à 20 membres', 'Roster basique', 'Calendrier manuel', 'Support communautaire'],
      buttonText: 'Commencer',
      highlighted: false
    },
    {
      name: 'Pro',
      price: '4.99€',
      period: '/ mois',
      description: 'Pour les guildes sérieuses qui raident régulièrement.',
      features: ['Jusqu\'à 100 membres', 'Synchro Battle.net complète', 'Calendrier avancé', 'Notifications Discord', 'Gestion des cotisations'],
      buttonText: 'Choisir Pro',
      highlighted: true
    },
    {
      name: 'Mythic',
      price: '9.99€',
      period: '/ mois',
      description: 'L\'outil ultime pour le progress et l\'optimisation.',
      features: ['Membres illimités', 'Suivi Raider.IO intégré', 'Gestion des loots (BiS)', 'Tracker de présence (30j)', 'Support prioritaire'],
      buttonText: 'Choisir Mythic',
      highlighted: false
    }
  ];
}