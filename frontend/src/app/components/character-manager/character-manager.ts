import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CharacterService, Character } from '../../services/character';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { I18nService } from '../../services/i18n';

type RoleFlag = 'is_tank' | 'is_heal' | 'is_dps';

@Component({
  selector: 'app-character-manager',
  templateUrl: './character-manager.html',
  styleUrl: './character-manager.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterManagerComponent {
  readonly i18n = inject(I18nService);
  readonly authService = inject(AuthService);
  private readonly characterService = inject(CharacterService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly roleFlags: { flag: RoleFlag; icon: string; tooltip: string }[] = [
    { flag: 'is_tank', icon: 'tank', tooltip: 'char.role.tooltip.tank' },
    { flag: 'is_heal', icon: 'heal', tooltip: 'char.role.tooltip.healer' },
    { flag: 'is_dps', icon: 'dps', tooltip: 'char.role.tooltip.dps' },
  ];

  readonly myCharacters = signal<Character[]>([]);
  readonly loaded = signal(false);
  readonly loadingBnet = signal(false);
  readonly importing = signal<ReadonlySet<string>>(new Set());
  readonly bnetQuery = signal('');
  private readonly bnetRoster = signal<Character[]>([]);

  /** Persos Battle.net pas encore importés (indépendant de l'ordre d'arrivée des deux requêtes). */
  readonly bnetCharacters = computed(() => {
    const mine = new Set(this.myCharacters().map((c) => this.key(c)));
    const query = this.bnetQuery().trim().toLowerCase();
    return this.bnetRoster()
      .filter((c) => !mine.has(this.key(c)))
      .filter(
        (c) =>
          !query ||
          c.name.toLowerCase().includes(query) ||
          c.realm.toLowerCase().includes(query) ||
          (c.guild?.name ?? '').toLowerCase().includes(query),
      )
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  });

  readonly guildName = computed(() => this.authService.currentGuild()?.name || '');

  constructor() {
    this.loadMyCharacters();
    this.fetchBnetCharacters();
  }

  private key(c: Pick<Character, 'name' | 'realm'>) {
    return `${c.name}-${c.realm}`.toLowerCase();
  }

  private loadMyCharacters() {
    this.characterService.getMyCharacters().subscribe({
      next: (chars) => {
        this.myCharacters.set(chars);
        this.loaded.set(true);
      },
      error: (err) => {
        this.loaded.set(true);
        console.error('[CharacterManager] Error loading my characters', err);
      },
    });
  }

  fetchBnetCharacters() {
    this.loadingBnet.set(true);
    this.characterService.getBnetCharacters().subscribe({
      next: (chars) => {
        this.bnetRoster.set(chars);
        this.loadingBnet.set(false);
      },
      error: (err) => {
        console.error('[CharacterManager] Error fetching Bnet characters', err);
        this.loadingBnet.set(false);
        if (err.status === 401) {
          this.toast.error(this.i18n.t('char.manager.toast.bnet_session_expired'));
          this.authService.login(window.location.pathname);
        }
      },
    });
  }

  importCharacter(char: Character) {
    const key = this.key(char);
    if (this.importing().has(key)) return;
    this.importing.update((set) => new Set(set).add(key));
    this.characterService.importCharacters([char]).subscribe({
      next: () => {
        this.importing.update((set) => {
          const next = new Set(set);
          next.delete(key);
          return next;
        });
        this.loadMyCharacters();
        this.toast.success(
          this.i18n.t('char.manager.toast.add_success').replace('{name}', char.name),
        );
        // Rafraîchir l'auth pour débloquer le site si c'est le premier perso
        this.authService.checkAuth().subscribe();
      },
      error: (err) => {
        this.importing.update((set) => {
          const next = new Set(set);
          next.delete(key);
          return next;
        });
        console.error('[CharacterManager] Error importing character', err);
        this.toast.error(this.i18n.t('char.manager.toast.add_error'));
      },
    });
  }

  isImporting(char: Character): boolean {
    return this.importing().has(this.key(char));
  }

  private patch(id: string, changes: Partial<Character>) {
    this.myCharacters.update((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }

  /** Bascule optimiste d'un rôle, annulée si l'API refuse. */
  toggleRole(char: Character, flag: RoleFlag) {
    if (!char.id) return;
    const previous = { is_tank: !!char.is_tank, is_heal: !!char.is_heal, is_dps: !!char.is_dps };
    const next = { ...previous, [flag]: !previous[flag] };
    this.patch(char.id, next);
    this.characterService
      .updateRoles(char.id, { isTank: next.is_tank, isHeal: next.is_heal, isDPS: next.is_dps })
      .subscribe({
        next: () => this.toast.success(this.i18n.t('char.manager.toast.roles_success')),
        error: (err) => {
          console.error('[CharacterManager] Error updating roles', err);
          this.patch(char.id!, previous);
          this.toast.error(this.i18n.t('char.manager.toast.roles_error'));
        },
      });
  }

  setMain(char: Character) {
    if (!char.id || char.is_main) return;
    const previous = this.myCharacters();
    this.myCharacters.set(previous.map((c) => ({ ...c, is_main: c.id === char.id })));
    this.characterService.setMainCharacter(char.id).subscribe({
      next: () =>
        this.toast.success(
          this.i18n.t('char.manager.toast.main_success').replace('{name}', char.name),
        ),
      error: (err) => {
        console.error('[CharacterManager] Error setting main character', err);
        this.myCharacters.set(previous);
        this.toast.error(this.i18n.t('char.manager.toast.main_error'));
      },
    });
  }

  async removeCharacter(char: Character) {
    if (!char.id) return;
    const ok = await this.confirm.ask(
      this.i18n.t('char.manager.confirm.delete_title'),
      this.i18n.t('char.manager.confirm.delete_desc').replace('{name}', char.name),
      undefined,
      undefined,
      true,
    );
    if (!ok) return;

    const previous = this.myCharacters();
    this.myCharacters.set(previous.filter((c) => c.id !== char.id));
    this.characterService.removeCharacter(char.id).subscribe({
      next: () =>
        this.toast.success(
          this.i18n.t('char.manager.toast.delete_success').replace('{name}', char.name),
        ),
      error: (err) => {
        console.error('[CharacterManager] Error removing character', err);
        this.myCharacters.set(previous);
        this.toast.error(this.i18n.t('char.manager.toast.delete_error'));
      },
    });
  }

  classId(className: string | undefined): string {
    return CharacterService.getClassId(className);
  }

  classIcon(className: string | undefined): string {
    return CharacterService.getClassIcon(className);
  }
}
