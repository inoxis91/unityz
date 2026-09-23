# Mode nuit : améliorations pour une PR de suivi

Ces points viennent de l'audit WCAG 2.1 lancé pendant le développement du mode nuit. Aucun n'est une régression : **ils existaient déjà avant** et la plupart touchent les deux thèmes, ou seulement le thème clair. Ils ont été laissés de côté volontairement pour garder la PR du mode nuit centrée sur le thème.

Seuils AA : **4.5:1** pour le texte normal, **3:1** pour le texte large (≥ 24px, ou ≥ 18.66px en gras) et les composants d'interface.

## Priorité 1 : lisibilité

### 1. Texte `--ui-text-faint` illisible en thème clair (≈ 2.5:1)
`#94a3b8` sur blanc ou sur `#f8fafc` ne passe pas AA. On le retrouve dans les textes d'aide, les états vides, les libellés de stats et les rangs.
- Exemples : `dashboard` (`.help-text`, `.m-name`, `.box-label`, `.rank-label`, empty states), `fees` (`.empty-msg`), `guild-characters` (`.stat-label`), `options` (`.btn-remove-icon`).
- **Correctif** : passer la valeur claire de `--ui-text-faint` à `#64748b` (4.76:1), ou basculer ces usages sur `--ui-text-muted`. La valeur sombre est déjà conforme.

### 2. Texte blanc sur fonds saturés clairs (2.1 à 3.8:1, les deux thèmes)
| Élément | Fichier | Ratio |
|---|---|---|
| Bouton « Annuler » (`.btn-admin.edit`, `#f59e0b`) | `event-details.css` | 2.15 |
| Badges de percentile orange / vert / rose (`.percentile-badge`) | `dashboard.css` | 2.5 à 3.5 |
| Bouton « Ajouter » (`.btn-import`, `#28a745`) | `options.css` | 3.13 |
| Onglet actif « Demandes en attente » (`#10b981`) | `crafts.css` | 2.54 |
| Bandeau Discord (`#ef4444`) | `app.ts` | 3.76 |
| Boutons pleins `#3b82f6` (sélecteur de langue actif, `.section-badge`, `.btn-save`, rôle actif) | plusieurs | 3.68 |
| `.lu-btn-badge` (blanc translucide sur `#0074e0`) | `raid-lineup.css` | 3.09 |

- **Correctif** : foncer ces fonds d'un cran (`#d97706` → `#b45309`, `#22c55e` → `#15803d`, `#ef4444` → `#dc2626`, `#3b82f6` → `#2563eb`), ou passer le texte en sombre (`#1e293b`) sur l'ambre et l'orange.

### 3. Couleurs de classe WoW claires sur fond blanc (thème clair)
Chasseur (1.7:1), Paladin (2.3:1), Prêtre (1:1), Voleur et Moine sont illisibles en texte sur fond blanc (`dashboard` « Mes personnages », `options` tableau des persos). Le thème sombre n'est pas concerné.
- **Correctif** : une variante texte par classe (`--color-<class>-text`), assombrie en clair (par exemple via `color-mix(in oklab, var(--color-hunter) 60%, black)`) et identique à la couleur de base en sombre. On garde la vraie couleur pour les bordures et les pastilles.

### 4. Liens et accents `#3b82f6` sur fond clair (3.4 à 3.7:1)
Liens `.view-all` (« Détails → », « Tout voir → »), `.guild-tag`, onglet actif des logs.
- **Correctif** : utiliser `--ui-fg-blue-600` / `--ui-fg-blue-700` en clair.

### 5. Carte « héros » du dashboard sans rendu du personnage
`.main-char-display.bg-class-priest` a un fond blanc pur. Si l'image de rendu Blizzard ne charge pas, le nom, le royaume et le badge MAIN (en blanc) disparaissent.
- **Correctif** : superposer un dégradé sombre en bas de la carte (`linear-gradient(to top, rgba(0,0,0,.65), transparent 60%)`) quelle que soit la classe.

## Priorité 2 : cohérence du design system

### 6. Couleurs saturées encore codées en dur
Les boutons pleins, statuts et accents (`#0074e0`, `#3b82f6`, `#10b981`, `#ef4444`, `#f59e0b`…) sont encore des littéraux dans environ 25 fichiers CSS. Ils fonctionnent dans les deux thèmes, mais on ne peut pas les ajuster globalement.
- **Correctif** : ajouter des tokens `--ui-accent`, `--ui-accent-hover`, `--ui-success`, `--ui-danger`, `--ui-warning` (fonds pleins + `-on` pour le texte) et migrer ces usages.

### 7. Variables locales qui dupliquent les tokens
`raid-lineup.css` (`--lu-*`), `admin-rosters.css` (`--tank`, `--border`, `--muted`, `--accent`…) et `lineup-status.css` (`--tone*`) redéfinissent localement ce que les tokens `--ui-*` couvrent déjà. `--border` et `--accent` masquent aussi des noms génériques.
- **Correctif** : remplacer par les tokens globaux ; garder uniquement les alias vraiment spécifiques, préfixés.

### 8. Styles inline dans les templates
Il reste des `style="background: #f59e0b !important; color: #fff !important"` (`event-details.html`, `calendar.html`, `admin-settings.html`).
- **Correctif** : les remplacer par des classes.

### 9. Garde-fou contre le retour des couleurs en dur
- Ajouter **Stylelint** avec `color-no-hex` et `declaration-property-value-disallowed-list` sur `color` / `background` / `border-color` dans `src/app/**` (en excluant `landing`, `login`, `select-guild`, `payment`, qui sont sombres par design), autoriser `var(--ui-*)`, et le lancer en CI.
- Documenter la règle dans `CLAUDE.md` : « tout nouveau style utilise les tokens `--ui-*` ».

## Priorité 3 : qualité et outillage

### 10. Tests d'accessibilité automatisés
Intégrer `@axe-core/playwright` (règle `color-contrast`) sur les routes principales, **dans les deux thèmes**, en forçant `data-theme`. Le script d'audit maison utilisé pour cette PR est en annexe.

### 11. Budgets CSS
`dashboard.css` (24.9 kB) et `event-details.css` (21.5 kB) dépassent le seuil d'avertissement de 20 kB. Les découper en sous-composants : `logs-dashboard` est déjà isolé ; sur le même modèle, on peut extraire les buffs, la composition M+ et la liste des participants.

### 12. Composant `event-details` en `ViewEncapsulation.None`
Ses styles (`.class-priest`, `.status-btn`, `textarea`…) fuient dans toute l'app, ce qui a causé le bug du Prêtre corrigé dans cette PR.
- **Correctif** : repasser en encapsulation émulée et préfixer ce qui doit vraiment être partagé.

### 13. Détails mineurs
- Séparateur du footer (`.footer-links .dot`, `rgba(255,255,255,.08)`) : quasi invisible dans les deux thèmes. Décoratif, mais à harmoniser avec `--ui-border`.
- Lien actif de la navbar (`#3b82f6` sur `#13223e`, 4.31:1) : passer à `#60a5fa`.
- `.empty-icon` (emoji en `--ui-text-faint`) : décoratif, ajouter `aria-hidden="true"`.
- `.attendance-value` et `.role-label` : textes de 0.7rem à la limite du seuil ; envisager 0.75rem minimum.

## Annexe : script d'audit de contraste

À coller dans la console Chrome sur une page de l'app. Il renvoie les textes et placeholders visibles sous le seuil AA, en tenant compte des fonds translucides et de l'opacité des ancêtres. Il ne gère pas les images de fond : ces éléments sont ignorés.

```js
(() => {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { const layers = []; let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.backgroundImage.includes('gradient')) { const c = parse(cs.backgroundImage); if (c) { layers.push(c); if (c.a >= 1) break; } } else if (cs.backgroundImage.includes('url(')) return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } e = e.parentElement; } let b = { r: 255, g: 255, b: 255, a: 1 }; for (let i = layers.length - 1; i >= 0; i--) b = over(layers[i], b); return { b, host: e }; };
  const opacity = (el, host) => { let o = 1, e = el; while (e && e.nodeType === 1) { o *= parseFloat(getComputedStyle(e).opacity); if (e === host) break; e = e.parentElement; } return o; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!(el.offsetWidth || el.offsetHeight) || el.closest('button:disabled')) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); const r = bgOf(el); if (!r) continue;
    const fg = parse(cs.color); fg.a *= opacity(el, r.host);
    const ratio = cr(over(fg, r.b), r.b); const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    if (ratio < (size >= 24 || (bold && size >= 18.66) ? 3 : 4.5)) out.push([ratio.toFixed(2), el.className, el.textContent.trim().slice(0, 30)]);
  }
  for (const f of document.querySelectorAll('textarea, input[placeholder]')) {
    if (!f.offsetWidth) continue; const r = bgOf(f); const pc = parse(getComputedStyle(f, '::placeholder').color);
    if (r && pc) { const ratio = cr(over(pc, r.b), r.b); if (ratio < 4.5) out.push([ratio.toFixed(2), 'placeholder', f.placeholder]); }
  }
  console.table(out);
})();
```
