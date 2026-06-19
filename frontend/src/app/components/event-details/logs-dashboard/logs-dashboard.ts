import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarService, WclReportMetrics, WclFight, WclPlayerPerf } from '../../../services/calendar';
import { I18nService } from '../../../services/i18n';

@Component({
  selector: 'app-logs-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './logs-dashboard.html',
  styleUrls: ['./logs-dashboard.css']
})
export class LogsDashboardComponent implements OnInit {
  private calendarService = inject(CalendarService);
  public i18n = inject(I18nService);

  @Input() eventId!: string;

  logsMetrics = signal<WclReportMetrics | null>(null);
  logsSubTab = signal<'overview' | 'bosses' | 'players' | 'mvp'>('overview');
  selectedFightId = signal<number | null>(null);
  loadingLogs = signal<boolean>(false);
  logsError = signal<boolean>(false);

  // Sorting
  logsPlayerSortBy = signal<'dps' | 'hps' | 'activeTime' | 'damageTaken' | 'deaths' | 'parse'>('dps');
  logsPlayerSortOrder = signal<'asc' | 'desc'>('desc');

  ngOnInit() {
    if (this.eventId) {
      this.loadLogsMetrics(this.eventId);
    }
  }

  loadLogsMetrics(id: string) {
    this.loadingLogs.set(true);
    this.logsError.set(false);
    this.calendarService.getEventLogsMetrics(id).subscribe({
      next: (metrics) => {
        this.logsMetrics.set(metrics);
        this.loadingLogs.set(false);
        if (metrics && metrics.fights && metrics.fights.length > 0) {
          this.selectedFightId.set(metrics.fights[0].id);
        }
      },
      error: (err) => {
        console.error('Error loading logs metrics:', err);
        this.logsError.set(true);
        this.loadingLogs.set(false);
      }
    });
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatHourDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  formatBigNumber(num: number): string {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2) + 'B';
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  formatNumberWithSpaces(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  getSelectedFight(): WclFight | null {
    const metrics = this.logsMetrics();
    const fightId = this.selectedFightId();
    if (!metrics || fightId === null) return null;
    return metrics.fights.find(f => f.id === fightId) || null;
  }

  getSortedPlayersForSelectedFight(): WclPlayerPerf[] {
    const fight = this.getSelectedFight();
    if (!fight) return [];
    
    const sortBy = this.logsPlayerSortBy();
    const isDesc = this.logsPlayerSortOrder() === 'desc';
    
    return [...fight.players].sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      
      if (valA < valB) return isDesc ? 1 : -1;
      if (valA > valB) return isDesc ? -1 : 1;
      return 0;
    });
  }

  setPlayerSort(field: 'dps' | 'hps' | 'activeTime' | 'damageTaken' | 'deaths' | 'parse') {
    if (this.logsPlayerSortBy() === field) {
      this.logsPlayerSortOrder.update(o => o === 'desc' ? 'asc' : 'desc');
    } else {
      this.logsPlayerSortBy.set(field);
      this.logsPlayerSortOrder.set('desc');
    }
  }

  getParseClass(parse: number): string {
    if (parse >= 99) return 'parse-legendary';
    if (parse >= 95) return 'parse-epic';
    if (parse >= 75) return 'parse-heroic';
    if (parse >= 50) return 'parse-rare';
    if (parse >= 25) return 'parse-uncommon';
    return 'parse-common';
  }

  getClassIcon(className: string | undefined): string {
    if (!className) return 'mage.webp';
    const c = className.toLowerCase().trim();
    if (c === 'deathknight' || c === 'death knight' || c === 'dk') return 'dk.webp';
    if (c === 'demonhunter' || c === 'demon hunter' || c === 'dh') return 'dh.webp';
    if (c === 'druid' || c === 'drood') return 'drood.webp';
    if (c === 'hunter' || c === 'hunt') return 'hunt.webp';
    if (c === 'evoker') return 'evoker.webp';
    if (c === 'mage') return 'mage.webp';
    if (c === 'monk') return 'monk.webp';
    if (c === 'paladin') return 'paladin.webp';
    if (c === 'priest') return 'priest.webp';
    if (c === 'rogue') return 'rogue.webp';
    if (c === 'shaman') return 'shaman.webp';
    if (c === 'warlock') return 'warlock.webp';
    if (c === 'warrior') return 'warrior.webp';
    return 'mage.webp';
  }

  getSortedHealersForFight(players: WclPlayerPerf[]): WclPlayerPerf[] {
    return [...players].sort((a, b) => b.hps - a.hps);
  }
}
