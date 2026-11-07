import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { runCommand } from './command';
import { type ContainerEvent, IncidentDetector, parseContainerEvent } from './container-incidents';
import { REHEARSED_PROJECTS } from './container-watch';

const WATCHED_EVENTS = ['start', 'die', 'kill', 'oom', 'health_status'];
/** Étiquette du conteneur qui marque la fin du parcours dans le flux. */
const END_MARKER_LABEL = 'trame.repetition.fin';
const END_MARKER_TIMEOUT_MILLISECONDS = 60_000;

/**
 * Le flux des événements Docker des stacks de Trame, du début à la fin du parcours. Un conteneur
 * remplacé par un déploiement emporte son compteur de redémarrages, mais pas les événements de
 * ses arrêts : seul ce flux voit un incident suivi d'un remplacement.
 */
export class ContainerEventWatch {
  private readonly detector = new IncidentDetector();
  private stream: ChildProcessWithoutNullStreams | undefined;
  private pendingText = '';
  private unreadableEvents = 0;
  private observedEvents = 0;
  private endMarkerSeen: (() => void) | undefined;

  /** Commence à l'heure du démon Docker : aucun événement ne tombe entre deux horloges. */
  async start(): Promise<void> {
    const daemonTime = JSON.parse(
      await runCommand('docker', ['system', 'info', '--format', '{{json .SystemTime}}']),
    ) as string;
    // Pas de filtre d'étiquette : Docker exige alors toutes les étiquettes à la fois, et le flux
    // resterait vide. Le projet de chaque événement est vérifié ici.
    const filters = ['--filter', 'type=container'];
    for (const event of WATCHED_EVENTS) {
      filters.push('--filter', `event=${event}`);
    }
    this.stream = spawn('docker', [
      'events',
      '--since',
      daemonTime,
      '--format',
      '{{json .}}',
      ...filters,
    ]);
    this.stream.stdout.on('data', (chunk: Buffer) => this.read(chunk.toString()));
  }

  /**
   * Lance un conteneur marqueur, attend son événement, puis arrête le flux : le flux est ordonné,
   * donc tous les événements antérieurs ont été lus. Rend les incidents du parcours.
   */
  async stop(markerImage: string): Promise<{ incidents: string[]; observedEvents: number }> {
    const markerReceived = new Promise<void>((resolve) => {
      this.endMarkerSeen = resolve;
    });
    await runCommand('docker', [
      'run',
      '--rm',
      '--label',
      `${END_MARKER_LABEL}=1`,
      '--entrypoint',
      'true',
      markerImage,
    ]);
    const timedOut = delay(END_MARKER_TIMEOUT_MILLISECONDS).then(() => {
      throw new Error('Fin du flux des événements Docker non reçue.');
    });
    try {
      await Promise.race([markerReceived, timedOut]);
    } finally {
      this.stream?.kill();
    }
    const incidents = this.detector.incidents();
    if (this.unreadableEvents > 0) {
      incidents.push(`${String(this.unreadableEvents)} événement(s) Docker illisible(s)`);
    }
    return { incidents, observedEvents: this.observedEvents };
  }

  private read(text: string): void {
    const lines = (this.pendingText + text).split('\n');
    this.pendingText = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() !== '') {
        this.readEvent(line);
      }
    }
  }

  private readEvent(line: string): void {
    let event: ContainerEvent;
    try {
      event = parseContainerEvent(line);
    } catch {
      // Un événement illisible pourrait cacher un incident : il est compté comme tel.
      this.unreadableEvents += 1;
      return;
    }
    if (event.labels.includes(END_MARKER_LABEL)) {
      this.endMarkerSeen?.();
      return;
    }
    if (REHEARSED_PROJECTS.includes(event.project)) {
      this.observedEvents += 1;
      this.detector.observe(event);
    }
  }
}
