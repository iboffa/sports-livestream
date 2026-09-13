import { Routes } from '@angular/router';
import { InGamePanelComponent } from './views/in-game/in-game-panel.component';
import { PreGameComponent } from './views/pre-game/pre-game.component';

export const routes: Routes = [
  { path: 'pre-game', component: PreGameComponent },
  { path: 'in-game', component: InGamePanelComponent },
  { path: '', redirectTo: 'pre-game', pathMatch: 'full' },
];
