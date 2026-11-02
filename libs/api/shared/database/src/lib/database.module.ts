import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { DatabaseReadiness } from './database-readiness';
import { DATABASE_OPTIONS, type DatabaseOptions, PrismaService } from './prisma.service';

export interface DatabaseModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: InjectionToken[];
  useFactory(...args: unknown[]): DatabaseOptions | Promise<DatabaseOptions>;
}

/** Fournit `PrismaService` et l'indicateur `DatabaseReadiness`. */
@Module({})
export class DatabaseModule {
  static forRootAsync(options: DatabaseModuleAsyncOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        { provide: DATABASE_OPTIONS, inject: options.inject ?? [], useFactory: options.useFactory },
        PrismaService,
        DatabaseReadiness,
      ],
      exports: [PrismaService, DatabaseReadiness],
    };
  }
}
