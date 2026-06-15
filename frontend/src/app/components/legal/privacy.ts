import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { I18nService } from '../../services/i18n';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="legal-container animated-fade-in">
      <div class="back-link">
        <a routerLink="/">← {{ i18n.currentLocale() === 'fr' ? 'Retour' : 'Back' }}</a>
      </div>

      <!-- FRENCH PRIVACY -->
      <div class="legal-content" *ngIf="i18n.currentLocale() === 'fr'">
        <h1>Politique de Confidentialité</h1>
        <p class="last-update">Dernière mise à jour : 15 Juin 2026</p>

        <section>
          <h2>1. Introduction (Conformité RGPD)</h2>
          <p>
            Nous attachons une grande importance à la protection de votre vie privée et à la sécurité de vos données personnelles. Les données collectées par Guild Manager sont stockées, traitées et protégées conformément au Règlement Général sur la Protection des Données (RGPD).
          </p>
        </section>

        <section>
          <h2>2. Données Collectées</h2>
          <p>
            Dans le cadre de l'utilisation de la plateforme et de notre bot Discord, nous collectons les types d'informations suivants :
          </p>
          <ul>
            <li><strong>Données Battle.net (Blizzard SSO) :</strong> Votre BattleTag (ex: Pseudo#1234) et un identifiant unique de compte. Lors de la synchronisation, nous importons également les informations publiques de vos personnages de World of Warcraft (nom, classe, niveau, royaume, niveau d'objet, et guilde).</li>
            <li><strong>Données Discord :</strong> Votre identifiant unique Discord (Discord ID) si vous choisissez de lier votre compte Discord ou d'être mentionné pour des rappels.</li>
            <li><strong>Données d'utilisation :</strong> Vos réponses aux événements du calendrier (présent, absent, peut-être, commentaires d'inscriptions) et vos déclarations de cotisations mensuelles.</li>
          </ul>
        </section>

        <section>
          <h2>3. Utilisation des Données</h2>
          <p>
            Vos données personnelles sont traitées exclusivement pour assurer le bon fonctionnement technique des fonctionnalités du Service :
          </p>
          <ul>
            <li>Permettre la connexion sécurisée sur le site et l'inscription aux activités de guilde.</li>
            <li>Synchroniser les rôles, grades de guilde et effectifs des rosters de manière automatique.</li>
            <li>Permettre au bot Discord de mentionner correctement les participants et d'envoyer des rappels d'événements par Message Privé (MP).</li>
            <li>Gérer l'historique et le suivi des cotisations de guilde.</li>
          </ul>
          <p>
            <strong>Aucune revente commerciale :</strong> Vos données ne sont jamais vendues, louées ou cédées à des tiers à des fins publicitaires ou marketing.
          </p>
        </section>

        <section>
          <h2>4. Conservation et Sécurité des Données</h2>
          <p>
            Vos données sont conservées sur des serveurs sécurisés équipés de bases de données protégées. Les jetons d'accès (access tokens) reçus de Battle.net sont stockés de manière chiffrée et ne sont jamais rendus publics ou exposés aux administrateurs de guilde.
          </p>
        </section>

        <section>
          <h2>5. Vos Droits (Accès, Modification et Suppression)</h2>
          <p>
            Conformément au RGPD, vous disposez d'un droit complet d'accès, de rectification et d'effacement de vos données personnelles :
          </p>
          <ul>
            <li><strong>Suppression de compte :</strong> Vous pouvez demander la suppression complète de vos données de notre base à tout moment via l'onglet des préférences ou en contactant un administrateur.</li>
            <li><strong>Déliement Discord / Battle.net :</strong> Vous pouvez révoquer les accès de notre application ou supprimer votre pseudo Discord lié dans vos options de profil pour suspendre immédiatement le traitement associé.</li>
          </ul>
        </section>

        <section>
          <h2>6. Cookies</h2>
          <p>
            Nous utilisons uniquement des cookies de session techniques strictement nécessaires à votre authentification et au maintien de votre connexion sur le Service. Aucun cookie de pistage publicitaire ou d'analyse tierce n'est utilisé.
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>
            Pour toute demande d'exercice de vos droits ou pour toute question sur notre politique de confidentialité, vous pouvez soumettre une demande via le site de la guilde ou par Message Privé à l'attention des officiers de la guilde.
          </p>
        </section>
      </div>

      <!-- ENGLISH PRIVACY -->
      <div class="legal-content" *ngIf="i18n.currentLocale() !== 'fr'">
        <h1>Privacy Policy</h1>
        <p class="last-update">Last updated: June 15, 2026</p>

        <section>
          <h2>1. Introduction (GDPR Compliance)</h2>
          <p>
            We take your privacy and the safety of your personal data very seriously. The data collected by Guild Manager is stored, processed, and protected in accordance with the General Data Protection Regulation (GDPR).
          </p>
        </section>

        <section>
          <h2>2. Data We Collect</h2>
          <p>
            Through your use of our platform and our Discord bot, we collect the following types of information:
          </p>
          <ul>
            <li><strong>Battle.net Data (Blizzard SSO):</strong> Your BattleTag (e.g., Nickname#1234) and a unique Blizzard account ID. During synchronization, we also import the public details of your World of Warcraft characters (name, class, level, realm, item level, and guild).</li>
            <li><strong>Discord Data:</strong> Your unique Discord ID if you choose to link your Discord account or receive automated reminders.</li>
            <li><strong>Usage Data:</strong> Your responses to calendar events (present, absent, maybe, signup comments) and your monthly guild fee declarations.</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Data</h2>
          <p>
            Your personal data is processed solely to ensure the technical execution of the Service's features:
          </p>
          <ul>
            <li>To enable secure login on the site and registration for guild activities.</li>
            <li>To automatically synchronize guild roles, ranks, and roster lists.</li>
            <li>To allow the Discord bot to properly mention participants and send automated event reminders via Direct Message (DM).</li>
            <li>To manage the history and ledger of guild membership fees.</li>
          </ul>
          <p>
            <strong>No commercial resale:</strong> Your data is never sold, rented, or shared with third parties for advertising or marketing purposes.
          </p>
        </section>

        <section>
          <h2>4. Data Retention and Security</h2>
          <p>
            Your data is kept on secure servers equipped with protected databases. Access tokens received from Battle.net are stored encrypted and are never made public or exposed to guild administrators.
          </p>
        </section>

        <section>
          <h2>5. Your Rights (Access, Modification, and Deletion)</h2>
          <p>
            In accordance with GDPR, you have the full right to access, rectify, and delete your personal data:
          </p>
          <ul>
            <li><strong>Account Deletion:</strong> You can request complete removal of your data from our database at any time through the profile settings tab or by contacting an administrator.</li>
            <li><strong>Unlinking Accounts:</strong> You can revoke application access or delete your linked Discord pseudo in your profile options to immediately halt the associated data processing.</li>
          </ul>
        </section>

        <section>
          <h2>6. Cookies</h2>
          <p>
            We only use strictly necessary technical session cookies to authenticate you and maintain your active session. No third-party tracking or analytics cookies are used.
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>
            To exercise your rights or for any questions regarding our privacy policy, you can submit a request through the guild website or via Direct Message to your guild officers.
          </p>
        </section>
      </div>
    </div>
  `,
  styles: [`
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
  `]
})
export class PrivacyPolicyComponent {
  public i18n = inject(I18nService);
}
