import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACTOR_RESOLVER, type ActorResolver } from './actor';
import { AuthGuard } from './auth.guard';

export interface AuthModuleOptions {
  /** Par défaut, aucun utilisateur n'est reconnu : toute route non publique répond 401. */
  resolveActor?: ActorResolver;
}

export interface AuthModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: InjectionToken[];
  useFactory(...args: unknown[]): AuthModuleOptions | Promise<AuthModuleOptions>;
}

const noActor: ActorResolver = () => undefined;

/** Enregistre `AuthGuard` comme garde globale de l'application. */
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions = {}): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        { provide: ACTOR_RESOLVER, useValue: options.resolveActor ?? noActor },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }

  /** Comme `forRoot`, avec un résolveur construit à partir de dépendances injectées (configuration, horloge). */
  static forRootAsync(options: AuthModuleAsyncOptions): DynamicModule {
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: ACTOR_RESOLVER,
          inject: options.inject ?? [],
          useFactory: async (...args: unknown[]): Promise<ActorResolver> => {
            const { resolveActor } = await options.useFactory(...args);
            return resolveActor ?? noActor;
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
