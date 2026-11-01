import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// Site de documentation (US-006 l'enrichit : arc42, C4, ADR, diagrammes, KaTeX, OpenAPI).
export default defineConfig({
  outDir: '../../dist/apps/docs',
  telemetry: false,
  integrations: [
    starlight({
      title: 'Trame',
      description: "Planification d'équipes sous contraintes : CP-SAT, PE, Angular, NestJS.",
      defaultLocale: 'root',
      locales: { root: { label: 'Français', lang: 'fr' } },
      sidebar: [{ label: 'Démarrer', items: [{ label: 'Accueil', slug: 'index' }] }],
    }),
  ],
});
