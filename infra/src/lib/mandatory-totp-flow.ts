/**
 * Flux de connexion par navigateur des realms déployés : une session existante, ou le mot de passe
 * puis le TOTP, sans condition (second facteur obligatoire, issue #47).
 *
 * Le flux « browser » de Keycloak ne demande l'OTP que si le compte en a enrôlé un. Une action
 * d'enrôlement imposée à la création ne suffit donc pas : un compte dont l'administration supprime
 * le TOTP se connecterait ensuite avec son seul mot de passe (revue de #48). Ici, l'OTP est exigé ;
 * s'il manque, Keycloak ajoute lui-même l'action CONFIGURE_TOTP, qui doit rester active, et impose
 * un nouvel enrôlement avant tout jeton.
 *
 * Seuls ces flux sont déclarés : à l'import, Keycloak 26 crée les flux par défaut absents. Leurs
 * alias commencent par « trame » pour n'en reprendre aucun.
 */
export const BROWSER_FLOW_ALIAS = 'trame browser';

const FORMS_FLOW_ALIAS = 'trame browser forms';

export const MANDATORY_TOTP_FLOWS = [
  {
    alias: BROWSER_FLOW_ALIAS,
    description: 'Session existante, ou mot de passe puis TOTP obligatoire',
    providerId: 'basic-flow',
    topLevel: true,
    builtIn: false,
    authenticationExecutions: [
      {
        authenticator: 'auth-cookie',
        authenticatorFlow: false,
        requirement: 'ALTERNATIVE',
        priority: 10,
      },
      {
        authenticatorFlow: true,
        flowAlias: FORMS_FLOW_ALIAS,
        requirement: 'ALTERNATIVE',
        priority: 20,
      },
    ],
  },
  {
    alias: FORMS_FLOW_ALIAS,
    description: 'Mot de passe puis TOTP, sans condition',
    providerId: 'basic-flow',
    topLevel: false,
    builtIn: false,
    authenticationExecutions: [
      {
        authenticator: 'auth-username-password-form',
        authenticatorFlow: false,
        requirement: 'REQUIRED',
        priority: 10,
      },
      {
        authenticator: 'auth-otp-form',
        authenticatorFlow: false,
        requirement: 'REQUIRED',
        priority: 20,
      },
    ],
  },
];
