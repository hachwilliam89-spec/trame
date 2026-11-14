/** Un événement Docker d'un conteneur des stacks de Trame (`docker events --format '{{json .}}'`). */
export interface ContainerEvent {
  action: string;
  containerId: string;
  name: string;
  /** Le projet Compose du conteneur ; vide hors Compose. */
  project: string;
  service: string;
  oneOff: boolean;
  exitCode: string | undefined;
  /** Numéro du signal d'un événement `kill` ; absent des autres événements. */
  signal: string | undefined;
  /** Les noms de toutes ses étiquettes et attributs. */
  labels: string[];
}

interface RawEvent {
  Action: string;
  Actor: { ID: string; Attributes: Record<string, string | undefined> };
}

export function parseContainerEvent(line: string): ContainerEvent {
  const event = JSON.parse(line) as RawEvent;
  const attributes = event.Actor.Attributes;
  return {
    action: event.Action,
    containerId: event.Actor.ID,
    name: attributes['name'] ?? event.Actor.ID,
    project: attributes['com.docker.compose.project'] ?? '',
    service: attributes['com.docker.compose.service'] ?? '',
    oneOff: attributes['com.docker.compose.oneoff'] === 'True',
    exitCode: attributes['exitCode'],
    signal: attributes['signal'],
    labels: Object.keys(attributes),
  };
}

/**
 * Les signaux par lesquels Docker demande l'arrêt d'un conteneur : SIGTERM par défaut, SIGQUIT
 * pour nginx (STOPSIGNAL de son image), SIGKILL passé le délai, et SIGINT. Docker émet aussi
 * `kill` pour les autres signaux, comme SIGHUP qui recharge une configuration : ceux-là ne
 * demandent pas l'arrêt, et un plantage qui les suit reste un incident.
 */
const STOP_SIGNALS = new Set(['2', '3', '9', '15']);

/**
 * Les incidents d'un parcours, d'après la suite des événements de chaque conteneur. Un arrêt
 * demandé (recréation, stop, down) émet `kill`, avec un signal d'arrêt, avant `die` ; un arrêt
 * sans cette demande est spontané, sauf la fin réussie d'une migration ponctuelle. La mémoire
 * épuisée et les sondes en échec sont toujours des incidents.
 */
export class IncidentDetector {
  private readonly stopRequested = new Set<string>();
  private readonly found: string[] = [];

  observe(event: ContainerEvent): void {
    if (event.action === 'kill') {
      if (STOP_SIGNALS.has(event.signal ?? '')) {
        this.stopRequested.add(event.containerId);
      }
      return;
    }
    if (event.action === 'start') {
      // Relancé, le conteneur ne peut plus s'arrêter que par une nouvelle demande.
      this.stopRequested.delete(event.containerId);
      return;
    }
    if (event.action === 'oom') {
      this.found.push(`${event.name} : mémoire épuisée`);
      return;
    }
    if (event.action === 'health_status: unhealthy') {
      this.found.push(`${event.name} : sonde en échec`);
      return;
    }
    if (event.action === 'die' && this.isSpontaneousStop(event)) {
      this.found.push(`${event.name} : arrêt non demandé (code ${event.exitCode ?? '?'})`);
    }
  }

  incidents(): string[] {
    return [...this.found];
  }

  private isSpontaneousStop(event: ContainerEvent): boolean {
    if (this.stopRequested.has(event.containerId)) {
      return false;
    }
    const migrationSucceeded =
      event.oneOff && event.service === 'migrator' && event.exitCode === '0';
    return !migrationSucceeded;
  }
}
