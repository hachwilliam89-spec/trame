import type { BrowserContext, Locator, Page } from 'playwright';
import { totpCode } from '../totp';
import { RequestTally } from './request-tally';

/**
 * Les parcours réels de la répétition, dans un navigateur : la console d'administration par le
 * tunnel, puis la connexion et le diagnostic depuis l'adresse publique du staging.
 */
export interface AccountCredentials {
  username: string;
  /** Donné par l'administration, à changer à la première connexion. */
  temporaryPassword: string;
  newPassword: string;
}

/** Une action que Keycloak impose à la première connexion. */
export type RequiredAction = 'totp-enrolment' | 'password-update';

const DIAGNOSTIC_HEADING = 'Tester le moteur';
const DIAGNOSTIC_SUCCESS = 'Les trois tâches ont été affectées.';
/** Deux actions sont attendues (TOTP, mot de passe) ; au-delà, une page se répète sur une erreur. */
const MAXIMUM_REQUIRED_ACTIONS = 4;
const DIAGNOSTIC_TIMEOUT_MILLISECONDS = 90_000;

/** Compte chaque réponse reçue par ce contexte de navigation, par hôte. */
export function tallyRequests(context: BrowserContext): RequestTally {
  const tally = new RequestTally();
  context.on('response', (response) => {
    tally.record({
      host: new URL(response.url()).host,
      status: response.status(),
      atMilliseconds: performance.now(),
    });
  });
  return tally;
}

/**
 * Ouvre la console d'administration sur les utilisateurs d'un realm, et s'y connecte. Réussit
 * quand la console connectée lit ce realm par l'API d'administration.
 */
export async function openAdminConsole(
  page: Page,
  adminUrl: string,
  credentials: { username: string; password: string },
  realm: string,
): Promise<void> {
  const adminApiAnswers: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/admin/realms')) {
      adminApiAnswers.push(`${String(response.status())} ${path}`);
    }
  });
  const realmRead = page.waitForResponse(
    (response) =>
      response.status() === 200 &&
      new URL(response.url()).pathname.startsWith(`/admin/realms/${realm}`),
  );
  // Si la connexion échoue, c'est son erreur qui est rapportée, pas cette attente sans réponse.
  realmRead.catch(() => undefined);
  try {
    await page.goto(`${adminUrl}/admin/master/console/#/${realm}/users`);
    await page.locator('#username').fill(credentials.username);
    await page.locator('#password').fill(credentials.password);
    await page.locator('#kc-login').click();
    await realmRead;
  } catch (error) {
    const answers = adminApiAnswers.join(', ');
    throw new Error(`${String(error)}\nRéponses de l’API d’administration : ${answers}`, {
      cause: error,
    });
  }
}

/**
 * Première connexion d'un compte créé par l'administration, depuis le front : identifiants, puis
 * les actions que Keycloak impose (enrôlement du TOTP, changement du mot de passe temporaire),
 * dans l'ordre où il les présente, jusqu'au retour dans l'application. Rend les actions faites.
 */
export async function signInForTheFirstTime(
  page: Page,
  applicationUrl: string,
  credentials: AccountCredentials,
): Promise<RequiredAction[]> {
  await page.goto(applicationUrl);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.locator('#username').fill(credentials.username);
  await page.locator('#password').fill(credentials.temporaryPassword);
  await submitAndWaitForNextPage(page, () => page.locator('#kc-login').click());

  const application = page.getByRole('heading', { name: DIAGNOSTIC_HEADING, exact: true });
  const totpEnrolment = page.locator('#totp');
  const passwordUpdate = page.locator('#password-new');
  const actionsDone: RequiredAction[] = [];
  while (actionsDone.length < MAXIMUM_REQUIRED_ACTIONS) {
    await application.or(totpEnrolment).or(passwordUpdate).first().waitFor();
    if (await application.isVisible()) {
      return actionsDone;
    }
    if (await passwordUpdate.isVisible()) {
      await updatePassword(page, passwordUpdate, credentials.newPassword);
      actionsDone.push('password-update');
    } else {
      await enrolTotp(page, totpEnrolment);
      actionsDone.push('totp-enrolment');
    }
  }
  throw new Error(`Connexion inachevée, page affichée : ${await describePage(page)}`);
}

/** Lance le diagnostic du moteur depuis le front, et attend son résultat. */
export async function runDiagnostic(page: Page): Promise<void> {
  await page.getByRole('button', { name: DIAGNOSTIC_HEADING, exact: true }).click();
  await page
    .getByRole('heading', { name: DIAGNOSTIC_SUCCESS, exact: true })
    .waitFor({ timeout: DIAGNOSTIC_TIMEOUT_MILLISECONDS });
}

/** L'adresse et le début du texte d'une page, pour dire où un parcours s'est arrêté. */
export async function describePage(page: Page): Promise<string> {
  const text = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  return `${page.url()} — ${text.replaceAll(/\s+/g, ' ').slice(0, 300)}`;
}

async function enrolTotp(page: Page, codeField: Locator): Promise<void> {
  // La page montre un QR code ; son mode manuel affiche le secret en clair.
  await page.locator('#mode-manual').click();
  const displayedSecret = await page.locator('#kc-totp-secret-key').innerText();
  const secret = displayedSecret.replaceAll(/\s/g, '');
  await codeField.fill(totpCode(secret, currentUnixSeconds()));
  await page.locator('#userLabel').fill('Répétition du staging');
  await submitAndWaitForNextPage(page, () => page.locator('#saveTOTPBtn').click());
}

async function updatePassword(page: Page, newPassword: Locator, password: string): Promise<void> {
  await newPassword.fill(password);
  const confirmation = page.locator('#password-confirm');
  await confirmation.fill(password);
  await submitAndWaitForNextPage(page, () => confirmation.press('Enter'));
}

/**
 * Chaque page de Keycloak a sa propre adresse : attendre qu'elle change évite de relire
 * l'ancienne page pendant que la suivante se charge.
 */
async function submitAndWaitForNextPage(page: Page, submit: () => Promise<void>): Promise<void> {
  const submittedFrom = page.url();
  await submit();
  await page.waitForURL((url) => url.href !== submittedFrom);
}

function currentUnixSeconds(): number {
  return Math.floor((performance.timeOrigin + performance.now()) / 1000);
}
