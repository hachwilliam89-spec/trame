import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
import { ScheduleGenerationNotFoundError } from './generation.errors';
import type { ScheduleGenerations } from './schedule-generations';

export interface GetScheduleGenerationQuery {
  organizationId: string;
  generationId: string;
}

export class GetScheduleGeneration {
  constructor(private readonly generations: ScheduleGenerations) {}

  async execute(query: GetScheduleGenerationQuery): Promise<ScheduleGeneration> {
    const generation = await this.generations.findById(query.organizationId, query.generationId);
    if (generation === undefined) {
      throw new ScheduleGenerationNotFoundError();
    }
    return generation;
  }
}
