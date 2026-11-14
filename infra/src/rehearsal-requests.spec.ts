import { RequestTally } from './lib/rehearsal/request-tally';

/**
 * Mesure des requêtes d'un parcours réel de la répétition (US-005 B2a, étape 4) : les limites de
 * débit de Traefik sont des valeurs de départ, à régler d'après ce qu'une vraie connexion envoie.
 */
const AUTH = 'auth.trame.wkhach.dev';
const STAGING = 'staging.trame.wkhach.dev';

describe('mesure des requêtes d’un parcours', () => {
  it('compte les requêtes de chaque hôte, du plus petit nom au plus grand', () => {
    const tally = new RequestTally();

    tally.record({ host: STAGING, status: 200, atMilliseconds: 0 });
    tally.record({ host: AUTH, status: 200, atMilliseconds: 10 });
    tally.record({ host: AUTH, status: 302, atMilliseconds: 20 });

    expect(Object.keys(tally.byHost())).toEqual([AUTH, STAGING]);
    expect(tally.byHost()[AUTH]?.requests).toBe(2);
    expect(tally.byHost()[STAGING]?.requests).toBe(1);
  });

  it('retient le plus grand nombre de requêtes sur une seconde glissante', () => {
    const tally = new RequestTally();

    // Trois requêtes en 900 ms, puis deux autres plus d'une seconde après la première.
    for (const atMilliseconds of [0, 400, 900, 1_100, 1_300]) {
      tally.record({ host: AUTH, status: 200, atMilliseconds });
    }

    // De 400 à 1 300 ms : quatre requêtes en moins d'une seconde.
    expect(tally.byHost()[AUTH]?.peakPerSecond).toBe(4);
  });

  it('ne compte pas dans la même seconde deux requêtes séparées d’une seconde exactement', () => {
    const tally = new RequestTally();

    tally.record({ host: AUTH, status: 200, atMilliseconds: 0 });
    tally.record({ host: AUTH, status: 200, atMilliseconds: 1_000 });

    expect(tally.byHost()[AUTH]?.peakPerSecond).toBe(1);
  });

  it('retient le pic quel que soit l’ordre d’arrivée des réponses', () => {
    const tally = new RequestTally();

    for (const atMilliseconds of [900, 0, 400]) {
      tally.record({ host: AUTH, status: 200, atMilliseconds });
    }

    expect(tally.byHost()[AUTH]?.peakPerSecond).toBe(3);
  });

  it('compte à part les requêtes refusées par la limite de débit', () => {
    const tally = new RequestTally();

    tally.record({ host: AUTH, status: 200, atMilliseconds: 0 });
    tally.record({ host: AUTH, status: 429, atMilliseconds: 5 });
    tally.record({ host: AUTH, status: 429, atMilliseconds: 6 });

    expect(tally.byHost()[AUTH]).toEqual({ requests: 3, peakPerSecond: 3, throttled: 2 });
    expect(tally.throttledRequests()).toBe(2);
  });
});
