import type { Route } from '@angular/router';
import { DiagnosticPage } from '@trame/web/scheduling/feature-diagnostic';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: DiagnosticPage },
  {
    path: 'planning',
    loadComponent: () =>
      import('@trame/web/scheduling/feature-planning').then((module) => module.PlanningPage),
  },
  { path: '**', redirectTo: '' },
];
