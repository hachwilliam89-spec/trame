import './app/browser-validation';
import { bootstrapApplication } from '@angular/platform-browser';
import { KeycloakDriver, WebSession, loadWebConfiguration } from '@trame/web/auth/data-access';
import { DiagnosticApi, DiagnosticState } from '@trame/web/scheduling/data-access';
import { appConfig } from './app/app.config';
import { applyBrowserPolicy } from './app/browser-policy';
import { App } from './app/app';

async function startApplication(): Promise<void> {
  const configuration = await loadWebConfiguration();
  applyBrowserPolicy(configuration.authServerUrl);
  const session = new WebSession(
    new KeycloakDriver(configuration, location.origin + '/oidc-callback'),
  );
  // Le SDK valide le callback et nettoie l'URL avant le démarrage du routeur Angular.
  await session.initialize();
  if (location.pathname === '/oidc-callback') history.replaceState(null, '', '/');
  const diagnostic = new DiagnosticState(
    new DiagnosticApi(() => session.token(), configuration.apiBasePath),
    browserStorage(),
    () => crypto.randomUUID(),
  );
  await bootstrapApplication(App, {
    ...appConfig,
    providers: [
      ...appConfig.providers,
      { provide: WebSession, useValue: session },
      { provide: DiagnosticState, useValue: diagnostic },
    ],
  });
}
function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
  }
}
void startApplication().catch(() => {
  const root = document.querySelector('tr-root');
  if (root !== null)
    root.textContent =
      'Trame ne peut pas démarrer. Vérifiez sa configuration puis rechargez la page.';
});
