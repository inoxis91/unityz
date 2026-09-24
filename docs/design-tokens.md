# Design tokens et thèmes

Toutes les couleurs de l'app connectée viennent de `frontend/src/styles.css`. Le thème est porté par `<html data-theme="light|dark">` (`ThemeService`) : chaque token a une valeur claire dans `:root` et une valeur sombre dans `:root[data-theme='dark']`.

Stylelint (`npm run lint:css`) refuse les couleurs hex/nommées dans `src/app/**` et les tailles de police sous 0.75rem. Exemptés : landing, login, select-guild, payment, navbar et support-widget, sombres par design.

## Familles

| Famille | Usage | Garantie |
|---|---|---|
| `--ui-bg-page`, `--ui-surface*` | fonds de page, cartes, champs | — |
| `--ui-border*` | bordures neutres (`-hover` au survol) | — |
| `--ui-text-*` | textes neutres (`strong` → `muted`) | AA sur page, surface, surface-muted/subtle |
| `--ui-fg-<teinte>-<n>` | textes colorés (liens, statuts) | AA sur surfaces et sur leurs teintes `-50/-100` |
| `--ui-bg-<teinte>-<n>`, `--ui-bd-<teinte>-<n>` | fonds et bordures teintés (badges, alertes) | opaques en sombre |
| `--ui-brand`, `--ui-accent`, `--ui-success`, `--ui-danger`, `--ui-warning`, `--ui-discord`, `--ui-neutral`, `--ui-purple` (+ `-hover`) | remplissages pleins qui portent du texte | AA avec `--ui-on-solid` (ou `--ui-on-warning` pour l'ambre) |
| `--ui-status-*`, `--ui-focus`, `--ui-role-*` | indicateurs sans texte : pastilles, barres, liserés, focus, rôles tank/heal/dps | ≥ 3:1 (composant d'interface) |
| `--ui-inverse-surface*`, `--ui-on-inverse*` | panneaux toujours sombres (réglages Discord, héros) | AA |
| `--ui-event-*` | couleur des types d'activité du calendrier | décoratif |
| `--ui-shade-rgb`, `--ui-ink-rgb`, `--ui-surface-rgb`, `--ui-highlight-rgb` | calques translucides : `rgba(var(--ui-ink-rgb), 0.1)` | — |

## Couleurs de jeu

- **Classes WoW** : `--color-<classe>` (teinte officielle : bordures, remplissages), `--color-<classe>-text` (même teinte ajustée pour un texte AA dans le thème courant) et `--color-<classe>-on` (texte posé sur la teinte).
  - Utilitaires globaux : `.class-<classe>` (texte), `.bg-class-<classe>` (carte remplie, les enfants héritent la couleur de texte avec `color: inherit`), `.border-class-<classe>`.
  - Dans un panneau toujours sombre en thème clair, ajouter `.inverse-context` pour obtenir les variantes texte sombres.
- **Warcraft Logs** : `--wcl-<palier>` (gray, green, blue, purple, orange, pink, gold) avec `-on` et `-text`.

## Ajouter une couleur

1. Réutiliser un token existant si le rôle est le même (texte, remplissage, indicateur).
2. Sinon, ajouter le token dans les deux blocs de `styles.css` et vérifier le contraste dans les deux thèmes.
3. `npm run e2e` (stack lancée) contrôle le contraste de tous les écrans connectés en clair, en sombre et en mobile sombre.

## UI kit (primitives partagées)

`styles.css` fournit aussi les briques communes des écrans connectés. Les composants gardent leur mise en page et n'en redéfinissent pas le style :

| Classe / composant | Usage |
|---|---|
| `<app-page-header>` (`shared/ui/page-header`) | en-tête de page : icône, titre, sous-titre, `tone`, emplacements `[pageActions]` et `[pageStats]` |
| `.ui-page` | colonne de page (espacement vertical) |
| `.ui-card`, `.ui-card-head`, `.ui-card-icon` | cartes : surface + dégradé radial (`--card-accent`), entrée échelonnée via `style="--i: n"` |
| `.ui-btn` + `primary`, `accent`, `success`, `danger`, `discord`, `ghost`, `subtle-danger`, `sm`, `icon`, `loading` | boutons |
| `.ui-tabs` (+ `.count`) | onglets segmentés (`aria-pressed` sur chaque bouton) |
| `.ui-field`, `.ui-input`, `.ui-label`, `.ui-check` | champs de formulaire |
| `.ui-badge` + `success`, `danger`, `warning`, `info`, `purple` ; `.ui-dot` (`.live`) | badges et pastilles |
| `.ui-kpis`, `.ui-kpi` + teinte | tuiles de chiffres clés |
| `.ui-empty`, `.ui-skeleton`, `.ui-spinner`, `.ui-alert` | états vides, chargement, alertes |
| `.ui-overlay`, `.ui-modal` (`wide`), `.ui-modal-head/-body/-foot`, `.ui-close` | modales, en bottom-sheet sous 640px |
| `.ui-table-wrap`, `.ui-table` | tableaux |
| `.visually-hidden` | texte réservé aux lecteurs d'écran |

Animations : `ui-rise`, `ui-pop`, `ui-fade`, `ui-sheet-in`, `ui-leave` (avec `animate.leave="ui-leave"`), `ui-float`, `ui-ping`, `ui-shimmer`, `ui-spin`, et les courbes `--ui-ease-out` / `--ui-ease-spring`. Un bloc global `prefers-reduced-motion` neutralise toutes les animations et transitions ; les composants gardent leur bloc local pour les transformations au survol.

Confirmations : `ConfirmService.ask(title, message, confirmText?, cancelText?, danger?)` — `danger = true` pour les suppressions.
