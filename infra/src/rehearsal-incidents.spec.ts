import { IncidentDetector, parseContainerEvent } from './lib/rehearsal/container-incidents';

/**
 * Incidents des conteneurs pendant la répétition (US-005 B2a, étape 4), lus dans le flux des
 * événements Docker du début à la fin du parcours : un conteneur remplacé emporte son compteur de
 * redémarrages, pas l'événement de son arrêt. Les séquences reprennent celles observées sur
 * Docker 29 : un arrêt demandé (recréation, stop, down) émet `kill` avant `die`, un arrêt spontané
 * émet `die` seul, puis `start` si Docker le relance.
 */
interface EventFields {
  action: string;
  id: string;
  name: string;
  service: string;
  oneOff?: boolean;
  exitCode?: string;
}

function eventLine(fields: EventFields): string {
  const attributes: Record<string, string> = {
    name: fields.name,
    'com.docker.compose.project': 'trame-staging',
    'com.docker.compose.service': fields.service,
    'com.docker.compose.oneoff': fields.oneOff === true ? 'True' : 'False',
  };
  if (fields.exitCode !== undefined) {
    attributes['exitCode'] = fields.exitCode;
  }
  return JSON.stringify({
    Type: 'container',
    Action: fields.action,
    Actor: { ID: fields.id, Attributes: attributes },
  });
}

const OLD_API = { id: 'ancienne-api', name: 'trame-staging-api-1', service: 'api' };
const NEW_API = { id: 'nouvelle-api', name: 'trame-staging-api-1', service: 'api' };

function detectorAfter(...lines: string[]): IncidentDetector {
  const detector = new IncidentDetector();
  for (const line of lines) {
    detector.observe(parseContainerEvent(line));
  }
  return detector;
}

describe('incidents des conteneurs pendant la répétition', () => {
  it('ne compte pas un remplacement demandé', () => {
    const detector = detectorAfter(
      eventLine({ action: 'start', ...OLD_API }),
      eventLine({ action: 'kill', ...OLD_API }),
      eventLine({ action: 'die', ...OLD_API, exitCode: '143' }),
      eventLine({ action: 'start', ...NEW_API }),
    );

    expect(detector.incidents()).toEqual([]);
  });

  it('garde un arrêt spontané, puis relancé, même quand le conteneur est remplacé ensuite', () => {
    const detector = detectorAfter(
      eventLine({ action: 'start', ...OLD_API }),
      eventLine({ action: 'die', ...OLD_API, exitCode: '1' }),
      eventLine({ action: 'start', ...OLD_API }),
      eventLine({ action: 'kill', ...OLD_API }),
      eventLine({ action: 'die', ...OLD_API, exitCode: '143' }),
      eventLine({ action: 'start', ...NEW_API }),
    );

    expect(detector.incidents()).toEqual(['trame-staging-api-1 : arrêt non demandé (code 1)']);
  });

  it('ne compte pas la fin d’une migration réussie, mais garde celle d’une migration en échec', () => {
    const migrator = { name: 'trame-staging-migrator-run-1', service: 'migrator', oneOff: true };

    const detector = detectorAfter(
      eventLine({ action: 'start', id: 'migration-1', ...migrator }),
      eventLine({ action: 'die', id: 'migration-1', ...migrator, exitCode: '0' }),
      eventLine({ action: 'start', id: 'migration-2', ...migrator }),
      eventLine({ action: 'die', id: 'migration-2', ...migrator, exitCode: '1' }),
    );

    expect(detector.incidents()).toEqual([
      'trame-staging-migrator-run-1 : arrêt non demandé (code 1)',
    ]);
  });

  it('garde une mémoire épuisée et une sonde en échec', () => {
    const detector = detectorAfter(
      eventLine({ action: 'oom', ...OLD_API }),
      eventLine({ action: 'health_status: unhealthy', ...OLD_API }),
      eventLine({ action: 'health_status: healthy', ...NEW_API }),
    );

    expect(detector.incidents()).toEqual([
      'trame-staging-api-1 : mémoire épuisée',
      'trame-staging-api-1 : sonde en échec',
    ]);
  });

  it('compte un arrêt spontané après une relance, même si un arrêt avait été demandé avant', () => {
    const detector = detectorAfter(
      eventLine({ action: 'kill', ...OLD_API }),
      eventLine({ action: 'die', ...OLD_API, exitCode: '143' }),
      eventLine({ action: 'start', ...OLD_API }),
      eventLine({ action: 'die', ...OLD_API, exitCode: '1' }),
    );

    expect(detector.incidents()).toEqual(['trame-staging-api-1 : arrêt non demandé (code 1)']);
  });
});
