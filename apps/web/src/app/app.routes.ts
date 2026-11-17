import type { Route } from '@angular/router';
import { DiagnosticPage } from '@trame/web/scheduling/feature-diagnostic';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: DiagnosticPage },
  // Chargée à la demande : seul le lien d'une semaine y mène.
  {
    path: 'planning',
    loadComponent: () =>
      import('@trame/web/scheduling/feature-planning').then((module) => module.PlanningPage),
  },
  { path: '**', redirectTo: '' },
];
