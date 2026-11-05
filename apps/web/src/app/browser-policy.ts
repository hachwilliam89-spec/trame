/** Politique locale exacte ; les en-têtes Traefik et le déploiement restent dans US-005. */
export function applyBrowserPolicy(authorityUrl: string): void {
  const authority = new URL(authorityUrl).origin;
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src 'self' ${authority}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
    `form-action 'self' ${authority}`,
  ].join('; ');
  document.head.appendChild(policy);
}
