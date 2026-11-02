import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACTOR_RESOLVER, type ActorResolver } from './actor';
import { AuthGuard } from './auth.guard';

export interface AuthModuleOptions {
  /** Par défaut, aucun utilisateur n'est reconnu : toute route non publique répond 401. */
  resolveActor?: ActorResolver;
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
}
