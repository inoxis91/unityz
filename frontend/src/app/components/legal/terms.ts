import { Component, inject } from '@angular/core';

import { RouterModule } from '@angular/router';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div class="legal-container animated-fade-in">
      <div class="back-link">
        <a routerLink="/">← {{ i18n.currentLocale() === 'fr' ? 'Retour' : 'Back' }}</a>
      </div>

      <!-- FRENCH TERMS -->
      @if (i18n.currentLocale() === 'fr') {
        <div class="legal-content">
          <h1>Conditions Générales d'Utilisation (CGU)</h1>
          <p class="last-update">Dernière mise à jour : 15 Juin 2026</p>
          <section>
            <h2>1. Acceptation des Conditions</h2>
            <p>
              En accédant au site Guild Manager et/ou en installant et utilisant le bot Discord
              associé (le "Service"), vous acceptez d'être lié par les présentes Conditions
              Générales d'Utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas
              utiliser le Service.
            </p>
          </section>
          <section>
            <h2>2. Description du Service</h2>
            <p>
              Guild Manager est une plateforme indépendante de gestion pour les guildes du jeu World
              of Warcraft (Blizzard Entertainment). Le Service propose la synchronisation des
              effectifs (rosters) via l'API Battle.net, la planification d'événements (calendrier),
              le suivi d'assiduité, la déclaration de cotisations et des notifications automatisées
              sur Discord via un bot dédié.
            </p>
          </section>
          <section>
            <h2>3. Éligibilité et Connexion</h2>
            <p>
              L'accès à l'espace membre nécessite une authentification via le protocole sécurisé
              Single Sign-On (SSO) de Blizzard Entertainment (Battle.net). Vous êtes seul
              responsable du maintien de la sécurité de votre compte de jeu et des accès qui y sont
              liés. Guild Manager ne vous demandera jamais votre mot de passe de jeu.
            </p>
          </section>
          <section>
            <h2>4. Règles d'Utilisation du Bot Discord et du Site</h2>
            <p>En utilisant le bot Discord et le site, vous vous engagez à :</p>
            <ul>
              <li>
                Ne pas tenter de contourner les restrictions de sécurité ou de perturber
                l'infrastructure du site et du bot.
              </li>
              <li>
                Ne pas utiliser les commentaires ou notifications pour propager du contenu illicite,
                haineux, diffamatoire ou contraire aux règles de la communauté de World of Warcraft.
              </li>
              <li>
                Ne pas exploiter de failles ou d'anomalies du Service à des fins malveillantes.
              </li>
            </ul>
          </section>
          <section>
            <h2>5. Propriété Intellectuelle</h2>
            <p>
              Les marques, logos, graphismes et technologies développés pour Guild Manager sont la
              propriété exclusive de l'éditeur de la plateforme. Les logos, images et données de jeu
              de World of Warcraft sont la propriété exclusive de Blizzard Entertainment.
            </p>
          </section>
          <section>
            <h2>6. Limitation de Responsabilité</h2>
            <p>
              Le Service est fourni "en l'état", sans garantie d'aucune sorte concernant sa
              disponibilité continue, l'absence d'erreurs ou la perte de données temporaires. Nous
              déclinons toute responsabilité en cas d'interruption du service causée par une panne
              de tiers (hébergeur, API Blizzard, API Discord, etc.).
            </p>
          </section>
          <section>
            <h2>7. Modification des Conditions</h2>
            <p>
              Nous nous réservons le droit de modifier les présentes conditions d'utilisation à tout
              moment afin de les adapter aux évolutions législatives, techniques ou de nouvelles
              fonctionnalités. L'utilisation continue du Service après publication des modifications
              constitue votre acceptation des nouvelles CGU.
            </p>
          </section>
          <section>
            <h2>8. Contact</h2>
            <p>
              Pour toute question relative aux présentes conditions, vous pouvez contacter
              l'administrateur de votre guilde ou soumettre un message d'aide directement sur le
              site.
            </p>
          </section>
        </div>
      }

      <!-- ENGLISH TERMS -->
      @if (i18n.currentLocale() !== 'fr') {
        <div class="legal-content">
          <h1>Terms of Service (ToS)</h1>
          <p class="last-update">Last updated: June 15, 2026</p>
          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing the Guild Manager website and/or installing and using the associated
              Discord bot (the "Service"), you agree to be bound by these Terms of Service. If you
              do not accept these terms, please do not use the Service.
            </p>
          </section>
          <section>
            <h2>2. Service Description</h2>
            <p>
              Guild Manager is an independent management platform for World of Warcraft (Blizzard
              Entertainment) guild communities. The Service provides roster synchronization via the
              Battle.net API, event scheduling (calendar), attendance tracking, guild fee
              declarations, and automated Discord bot notifications.
            </p>
          </section>
          <section>
            <h2>3. Eligibility and Authentication</h2>
            <p>
              Accessing member areas requires authentication via Blizzard Entertainment's secure
              Battle.net Single Sign-On (SSO). You are solely responsible for maintaining the
              security of your game account and credentials. Guild Manager will never ask for your
              game password.
            </p>
          </section>
          <section>
            <h2>4. Usage Rules for Discord Bot & Website</h2>
            <p>By using the bot and website, you agree:</p>
            <ul>
              <li>
                Not to attempt to bypass security restrictions or disrupt the infrastructure of the
                website and bot.
              </li>
              <li>
                Not to use comments or notifications to spread unlawful, hateful, defamatory, or
                offensive content contrary to World of Warcraft community standards.
              </li>
              <li>Not to exploit any bugs or anomalies in the Service for malicious purposes.</li>
            </ul>
          </section>
          <section>
            <h2>5. Intellectual Property</h2>
            <p>
              All trademarks, logos, graphics, and technologies developed for Guild Manager are the
              exclusive property of the platform developer. All World of Warcraft logos, images, and
              in-game data are the exclusive property of Blizzard Entertainment.
            </p>
          </section>
          <section>
            <h2>6. Limitation of Liability</h2>
            <p>
              The Service is provided "as is", without warranty of any kind regarding continuous
              availability, absence of errors, or temporary data loss. We decline all liability for
              service interruptions caused by third-party failures (host, Blizzard API, Discord API,
              etc.).
            </p>
          </section>
          <section>
            <h2>7. Modification of Terms</h2>
            <p>
              We reserve the right to modify these terms of service at any time to adapt to
              legislative, technical, or feature updates. Continued use of the Service after
              modifications are posted constitutes acceptance of the updated ToS.
            </p>
          </section>
          <section>
            <h2>8. Contact</h2>
            <p>
              For any questions regarding these terms, you may contact your guild administrator or
              submit a help request directly through the website.
            </p>
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .legal-container {
        max-width: 800px;
        margin: 40px auto;
        padding: 2rem;
        background: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
        color: #1e293b;
      }
      .back-link {
        margin-bottom: 2rem;
        text-align: left;
      }
      .back-link a {
        color: #3b82f6;
        font-weight: 600;
        text-decoration: none;
        font-size: 0.95rem;
      }
      .legal-content {
        text-align: left;
      }
      .legal-content h1 {
        font-size: 2rem;
        font-weight: 800;
        color: #0f172a;
        margin: 0 0 0.5rem 0;
      }
      .last-update {
        color: #64748b;
        font-size: 0.9rem;
        margin-bottom: 2.5rem;
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 1rem;
      }
      section {
        margin-bottom: 2rem;
      }
      section h2 {
        font-size: 1.25rem;
        font-weight: 700;
        color: #1e293b;
        margin-top: 0;
        margin-bottom: 0.75rem;
      }
      section p {
        font-size: 0.95rem;
        line-height: 1.6;
        color: #475569;
        margin: 0 0 1rem 0;
      }
      ul {
        margin: 0 0 1rem 0;
        padding-left: 1.5rem;
        color: #475569;
        font-size: 0.95rem;
        line-height: 1.6;
      }
      li {
        margin-bottom: 0.5rem;
      }
    `,
  ],
})
export class TermsOfServiceComponent {
  public i18n = inject(I18nService);
}
