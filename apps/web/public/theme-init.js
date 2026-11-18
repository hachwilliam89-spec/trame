/*
 * Pose le thème choisi sur <html> avant le premier rendu, pour éviter un flash du mauvais thème.
 * Fichier externe : la politique de sécurité refuse les scripts en ligne. `ThemePreference`
 * reprend ensuite la main, avec la même clé et les mêmes valeurs.
 */
(() => {
  const root = document.documentElement;
  let choice = 'system';
  try {
    const saved = window.localStorage.getItem('trame.theme');
    if (saved === 'light' || saved === 'dark') choice = saved;
  } catch {
    // Stockage refusé (navigation privée stricte) : on suit le système.
  }
  const systemDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme-choice', choice);
  root.setAttribute('data-theme', choice === 'system' ? (systemDark ? 'dark' : 'light') : choice);
})();
