import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRostersComponent } from './admin-rosters/admin-rosters';
import { AdminFeesComponent } from './admin-fees/admin-fees';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminRostersComponent, AdminFeesComponent],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminComponent implements OnInit {
  activeTab = signal<'rosters' | 'fees'>('rosters');

  constructor() {}

  ngOnInit() {}
}
