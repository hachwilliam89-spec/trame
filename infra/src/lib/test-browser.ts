import type { Browser, BrowserType } from 'playwright';

export interface TestBrowserOptions {
  args?: string[];
}

/**
 * Le navigateur d'un test. Sur un poste, Playwright le lance localement. En CI, `PLAYWRIGHT_SERVER`
 * désigne le serveur Playwright de l'image officielle, épinglée par digest (.github/workflows) : ses
 * navigateurs et leurs dépendances système y sont déjà installés, sans installation apt à chaque
 * passage. Il partage le réseau de l'hôte, et joint donc les mêmes adresses 127.0.0.1 que le test.
 */
export function launchTestBrowser(
  browserType: BrowserType,
  options: TestBrowserOptions = {},
): Promise<Browser> {
  const server = process.env['PLAYWRIGHT_SERVER'];
  if (server === undefined || server === '') {
    return browserType.launch(options);
  }
  // Le serveur lance le navigateur demandé avec ces options, transmises par cet en-tête.
  return browserType.connect(server, {
    headers: { 'x-playwright-launch-options': JSON.stringify(options) },
  });
}
