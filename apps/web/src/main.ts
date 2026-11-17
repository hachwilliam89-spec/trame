import './app/browser-validation';
import { bootstrapApplication } from '@angular/platform-browser';
import { KeycloakDriver, WebSession, loadWebConfiguration } from '@trame/web/auth/data-access';
import {
  DiagnosticApi,
  DiagnosticState,
  PlanningApi,
  PlanningState,
  planningReturnAddress,
} from '@trame/web/scheduling/data-access';
import { appConfig } from './app/app.config';
import { applyBrowserPolicy } from './app/browser-policy';
import { App } from './app/app';
import { browserStorage } from './app/browser-storage';

async function startApplication(): Promise<void> {
  const configuration = await loadWebConfiguration();
  applyBrowserPolicy(configuration.authServerUrl);
  const session = new WebSession(
    new KeycloakDriver(configuration, location.origin + '/oidc-callback'),
  );
  // Le SDK valide le callback et nettoie l'URL avant le démarrage du routeur Angular.
  await session.initialize();
  // Keycloak revient toujours ici : la semaine retenue avant la connexion est rouverte.
  if (location.pathname === '/oidc-callback') {
    history.replaceState(null, '', planningReturnAddress(browserStorage()));
  }
  const diagnostic = new DiagnosticState(
    new DiagnosticApi(() => session.token(), configuration.apiBasePath),
    browserStorage(),
    () => crypto.randomUUID(),
  );
  const planning = new PlanningState(
    new PlanningApi(() => session.token(), configuration.apiBasePath),
    () => crypto.randomUUID(),
  );
  await bootstrapApplication(App, {
    ...appConfig,
    providers: [
      ...appConfig.providers,
      { provide: WebSession, useValue: session },
      { provide: DiagnosticState, useValue: diagnostic },
      { provide: PlanningState, useValue: planning },
    ],
  });
}
void startApplication().catch(() => {
  const root = document.querySelector('tr-root');
  if (root !== null)
    root.textContent =
      'Trame ne peut pas démarrer. Vérifiez sa configuration puis rechargez la page.';
});
