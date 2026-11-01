import { Injectable } from '@nestjs/common';
import type { ReadinessIndicator } from '@trame/platform/health';
import { PrismaService } from './prisma.service';

/** Indicateur `database` de `health/ready` : la base répond à `SELECT 1`. */
@Injectable()
export class DatabaseReadiness implements ReadinessIndicator {
  readonly name = 'database';

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
