import { config } from 'zod';

// Ce module doit être évalué avant la construction des schémas : Zod mémorise ce choix.
// Le navigateur conserve ainsi une CSP sans unsafe-eval, y compris au retour OIDC.
config({ jitless: true });
