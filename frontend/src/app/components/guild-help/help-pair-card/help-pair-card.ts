import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { HelpPair } from '../../../services/guild-help';
import { I18nService } from '../../../services/i18n';
import { ToastService } from '../../../services/toast';
import { HelpMemberComponent } from '../help-member/help-member';
import { categoryEmoji, myPairView, pairAge, pairMember } from '../guild-help-utils';

@Component({
  selector: 'app-help-pair-card',
  imports: [HelpMemberComponent],
  templateUrl: './help-pair-card.html',
  styleUrl: './help-pair-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpPairCardComponent {
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  readonly pair = input.required<HelpPair>();
  readonly userId = input<string | undefined>();
  /** `mine` : carte détaillée avec contact ; `guild` : ligne compacte. */
  readonly variant = input<'mine' | 'guild'>('guild');
  readonly canEnd = input(false);

  readonly end = output<HelpPair>();

  protected readonly helper = computed(() => pairMember(this.pair(), 'helper'));
  protected readonly helped = computed(() => pairMember(this.pair(), 'helped'));
  protected readonly view = computed(() => myPairView(this.pair(), this.userId()));
  protected readonly emoji = computed(() => categoryEmoji(this.pair().category));
  protected readonly discordUrl = computed(() => {
    const id = this.pair().partner_discord_id;
    return id ? `https://discord.com/users/${encodeURIComponent(id)}` : null;
  });
  protected readonly since = computed(() => {
    const { unit, count } = pairAge(this.pair().started_at);
    return this.i18n.tf(`help.pair.since_${unit}`, { count });
  });

  async copyBattletag(): Promise<void> {
    const battletag = this.view().partner.battletag;
    try {
      await navigator.clipboard.writeText(battletag);
      this.toast.success(this.i18n.tf('help.pair.copied', { battletag }));
    } catch {
      this.toast.info(battletag);
    }
  }
}
