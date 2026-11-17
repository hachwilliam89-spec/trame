import {
  positionPageV1,
  shiftTemplatePageV1,
  siteV1,
  type PositionV1,
  type ShiftTemplateV1,
  type SiteV1,
} from '@trame/shared/contracts/organization';
import {
  scheduleGenerationV1,
  weekScheduleGenerationsV1,
  type ScheduleGenerationProgressV1,
  type ScheduleGenerationV1,
  type StartScheduleGenerationRequestV1,
  type WeekScheduleGenerationsV1,
} from '@trame/shared/contracts/scheduling';
import { employeePageV1, type EmployeeV1 } from '@trame/shared/contracts/staff';
import type * as z from 'zod';
import { readScheduleGenerationProgress } from './progress-stream';

/** Taille de page maximale de l'API : douze salariés tiennent en une page, mille en dix. */
const PAGE_LIMIT = 100;

export class PlanningHttpError extends Error {
  constructor(readonly status: number) {
    super('Planning indisponible');
  }
}

/** Ce que le planning lit dans l'API ; une doublure le remplace dans les tests de la façade. */
export interface PlanningGateway {
  site(siteId: string, signal: AbortSignal): Promise<SiteV1>;
  positions(siteId: string, signal: AbortSignal): Promise<PositionV1[]>;
  shiftTemplates(siteId: string, signal: AbortSignal): Promise<ShiftTemplateV1[]>;
  employees(siteId: string, signal: AbortSignal): Promise<EmployeeV1[]>;
  week(
    siteId: string,
    weekStartsOn: string,
    signal: AbortSignal,
  ): Promise<WeekScheduleGenerationsV1>;
  generation(generationId: string, signal: AbortSignal): Promise<ScheduleGenerationV1>;
  start(
    request: StartScheduleGenerationRequestV1,
    key: string,
    signal: AbortSignal,
  ): Promise<ScheduleGenerationV1>;
  follow(
    generationId: string,
    receive: (event: ScheduleGenerationProgressV1) => void,
    signal: AbortSignal,
  ): Promise<void>;
}

interface PageOf<Item> {
  items: Item[];
  nextCursor: string | null;
}

export class PlanningApi implements PlanningGateway {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly basePath = '/api/v1',
    private readonly request: typeof fetch = fetch,
  ) {}

  async site(siteId: string, signal: AbortSignal): Promise<SiteV1> {
    const response = await this.call(`/sites/${encodeURIComponent(siteId)}`, { signal });
    return siteV1.parse(await response.json());
  }

  positions(siteId: string, signal: AbortSignal): Promise<PositionV1[]> {
    const path = `/sites/${encodeURIComponent(siteId)}/positions`;
    return this.allPages(path, new URLSearchParams(), positionPageV1, signal);
  }

  shiftTemplates(siteId: string, signal: AbortSignal): Promise<ShiftTemplateV1[]> {
    const path = `/sites/${encodeURIComponent(siteId)}/shift-templates`;
    return this.allPages(path, new URLSearchParams(), shiftTemplatePageV1, signal);
  }

  employees(siteId: string, signal: AbortSignal): Promise<EmployeeV1[]> {
    return this.allPages('/employees', new URLSearchParams({ siteId }), employeePageV1, signal);
  }

  async week(
    siteId: string,
    weekStartsOn: string,
    signal: AbortSignal,
  ): Promise<WeekScheduleGenerationsV1> {
    const query = new URLSearchParams({ siteId, weekStartsOn });
    const response = await this.call(`/schedule-generations?${query.toString()}`, { signal });
    return weekScheduleGenerationsV1.parse(await response.json());
  }

  async generation(generationId: string, signal: AbortSignal): Promise<ScheduleGenerationV1> {
    const response = await this.call(this.generationPath(generationId), { signal });
    const generation = scheduleGenerationV1.parse(await response.json());
    if (generation.id !== generationId) throw new Error('Génération incohérente');
    return generation;
  }

  async start(
    request: StartScheduleGenerationRequestV1,
    key: string,
    signal: AbortSignal,
  ): Promise<ScheduleGenerationV1> {
    const response = await this.call('/schedule-generations', {
      method: 'POST',
      body: JSON.stringify(request),
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      signal,
    });
    return scheduleGenerationV1.parse(await response.json());
  }

  async follow(
    generationId: string,
    receive: (event: ScheduleGenerationProgressV1) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await this.call(this.generationPath(generationId) + '/events', {
      headers: { accept: 'text/event-stream' },
      signal,
    });
    // 204 : la génération était déjà finie, il n'y a rien à suivre.
    if (response.status === 204) return;
    await readScheduleGenerationProgress(response, generationId, receive);
  }

  private generationPath(generationId: string): string {
    return `/schedule-generations/${encodeURIComponent(generationId)}`;
  }

  /** Suit les curseurs jusqu'à la dernière page. */
  private async allPages<Item>(
    path: string,
    query: URLSearchParams,
    page: z.ZodType<PageOf<Item>>,
    signal: AbortSignal,
  ): Promise<Item[]> {
    const items: Item[] = [];
    let cursor: string | null = null;
    do {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set('limit', String(PAGE_LIMIT));
      if (cursor !== null) pageQuery.set('cursor', cursor);
      const response = await this.call(`${path}?${pageQuery.toString()}`, { signal });
      const current = page.parse(await response.json());
      items.push(...current.items);
      cursor = current.nextCursor;
    } while (cursor !== null);
    return items;
  }

  private async call(path: string, options: RequestInit): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('authorization', 'Bearer ' + (await this.token()));
    const execute = this.request;
    const response = await execute(this.basePath + path, {
      ...options,
      headers,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new PlanningHttpError(response.status);
    return response;
  }
}
