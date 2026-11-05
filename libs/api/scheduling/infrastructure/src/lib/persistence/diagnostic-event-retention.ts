import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PruneDiagnosticProgress } from '@trame/api/scheduling/application';

/** Purge au démarrage puis chaque minute, sans superposer deux nettoyages. */
@Injectable()
export class DiagnosticEventRetention implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DiagnosticEventRetention.name);
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running?: Promise<void>;
  constructor(private readonly prune: PruneDiagnosticProgress) {}
  onApplicationBootstrap(): void {
    this.schedule(0);
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.clean();
    }, delay);
    this.timer.unref();
  }
  private async clean(): Promise<void> {
    try {
      await this.prune.execute();
    } catch (error) {
      this.logger.warn({
        event: 'diagnostic_retention_failed',
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    } finally {
      this.schedule(60_000);
    }
  }
}
