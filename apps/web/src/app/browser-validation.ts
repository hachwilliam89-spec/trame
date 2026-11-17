import { config } from 'zod';

// Ce module doit être évalué avant la construction des schémas : Zod mémorise ce choix. Il est
// déclaré dans `polyfills` (project.json), exécuté avant `main` et ses morceaux partagés : un
// import en tête de `main.ts` ne suffit plus dès qu'une route chargée à la demande partage Zod.
// Le navigateur conserve ainsi une CSP sans unsafe-eval, y compris au retour OIDC.
config({ jitless: true });
