import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  APPLICATION_SERVICES,
  type DeployedService,
  type DeployedStackConfig,
  exampleVariables,
  resolvedStackConfig,
} from './lib/deployed-stacks';
import { devStackImage } from './lib/pinned-images';

/**
 * Politique des stacks `trame-shared` et `trame-staging` (US-005 B2a, #47, ADR-0016), vérifiée sur
 * la configuration que Docker appliquerait, avec les modèles de secrets du dépôt.
 */
const KEYCLOAK_DOCKERFILE = join(__dirname, '../docker/keycloak.Dockerfile');
const APPLICATION_IMAGE = /^ghcr\.io\/hachwilliam89-spec\/trame-[a-z]+@sha256:[0-9a-f]{64}$/;
const SENSITIVE_VARIABLE = /PASSWORD|SECRET|TOKEN|DATABASE_URL|AMQP_URL/;
const KEYCLOAK_PUBLIC_RULE =
  'Host(`auth.trame.wkhach.dev`) && (PathPrefix(`/realms/trame-staging/`) || PathPrefix(`/resources/`))';

interface NamedService {
  stack: string;
  name: string;
  service: DeployedService;
}

describe('stacks des environnements déployés (US-005 B2a)', () => {
  const stacks: Record<string, DeployedStackConfig> = {};

  beforeAll(async () => {
    stacks['shared'] = await resolvedStackConfig('shared');
    stacks['staging'] = await resolvedStackConfig('staging');
  });

  function allServices(): NamedService[] {
    const services: NamedService[] = [];
    for (const [stack, config] of Object.entries(stacks)) {
      for (const [name, service] of Object.entries(config.services)) {
        services.push({ stack, name, service });
      }
    }
    return services;
  }

  function service(stack: string, name: string): DeployedService {
    const found = stacks[stack]?.services[name];
    if (found === undefined) throw new Error(`Service absent : ${stack}/${name}`);
    return found;
  }

  /** Les noms Docker des réseaux d'un service, tels que `docker network ls` les affiche. */
  function networkNamesOf(stack: string, name: string): string[] {
    const config = stacks[stack];
    const names: string[] = [];
    for (const key of Object.keys(service(stack, name).networks ?? {})) {
      names.push(config?.networks[key]?.name ?? key);
    }
    return names.sort();
  }

  function servicesOn(networkName: string): string[] {
    const members: string[] = [];
    for (const { stack, name } of allServices()) {
      if (networkNamesOf(stack, name).includes(networkName)) {
        members.push(name);
      }
    }
    return members.sort();
  }

  function network(stack: string, networkName: string) {
    return Object.values(stacks[stack]?.networks ?? {}).find(
      (candidate) => candidate.name === networkName,
    );
  }

  it('ne publie aucun port sur l’hôte', () => {
    for (const { stack, name, service: definition } of allServices()) {
      expect({ service: `${stack}/${name}`, ports: definition.ports ?? [] }).toEqual({
        service: `${stack}/${name}`,
        ports: [],
      });
    }
  });

  it('n’expose sur edge que Keycloak et le front', () => {
    expect(servicesOn('edge')).toEqual(['keycloak', 'web']);
    expect(network('shared', 'edge')).toMatchObject({ external: true });
    expect(network('staging', 'edge')).toMatchObject({ external: true });
  });

  it('garde PostgreSQL et RabbitMQ sur le seul réseau de données, interne', () => {
    expect(networkNamesOf('shared', 'postgres')).toEqual(['trame-data']);
    expect(networkNamesOf('shared', 'rabbitmq')).toEqual(['trame-data']);
    expect(servicesOn('trame-data')).toEqual(
      ['api', 'keycloak', 'migrator', 'postgres', 'rabbitmq', 'relay', 'worker'].sort(),
    );
    expect(network('shared', 'trame-data')).toMatchObject({ internal: true });
  });

  it('relie Keycloak à sa base, et l’API seule à Keycloak, par des réseaux internes', () => {
    expect(networkNamesOf('shared', 'keycloak')).toEqual(['edge', 'trame-auth', 'trame-data']);
    expect(servicesOn('trame-auth')).toEqual(['api', 'keycloak']);
    expect(network('shared', 'trame-auth')).toMatchObject({ internal: true });
    expect(network('staging', 'trame-staging')).toMatchObject({ internal: true });
  });

  it('nomme chaque routeur, service et middleware Traefik avec le préfixe trame-', () => {
    for (const { name, service: definition } of allServices()) {
      for (const label of Object.keys(definition.labels ?? {})) {
        const traefikObject = /^traefik\.http\.(routers|services|middlewares)\.([^.]+)\./.exec(
          label,
        );
        if (traefikObject !== null) {
          expect({
            service: name,
            label,
            prefixed: traefikObject[2]?.startsWith('trame-'),
          }).toEqual({
            service: name,
            label,
            prefixed: true,
          });
        }
      }
    }
  });

  it('n’ouvre de Keycloak que le realm de staging et les ressources des pages de connexion', () => {
    const labels = service('shared', 'keycloak').labels ?? {};

    expect(labels['traefik.http.routers.trame-auth.rule']).toBe(KEYCLOAK_PUBLIC_RULE);
    expect(labels['traefik.http.routers.trame-auth.entrypoints']).toBe('websecure');
    expect(labels['traefik.docker.network']).toBe('edge');
  });

  it('sert le staging sur son seul nom, et limite le débit de chaque route publique', () => {
    const webLabels = service('staging', 'web').labels ?? {};
    expect(webLabels['traefik.http.routers.trame-staging-web.rule']).toBe(
      'Host(`staging.trame.wkhach.dev`)',
    );
    expect(webLabels['traefik.docker.network']).toBe('edge');

    for (const [stack, name] of [
      ['shared', 'keycloak'],
      ['staging', 'web'],
    ] as const) {
      const labels = service(stack, name).labels ?? {};
      const routers = Object.keys(labels).filter((label) => label.endsWith('.rule'));
      expect(routers).toHaveLength(1);
      const router = routers[0]?.replace(/\.rule$/, '') ?? '';
      const middleware = labels[`${router}.middlewares`] ?? '';
      expect(labels[`traefik.http.middlewares.${middleware}.ratelimit.average`]).toMatch(/^\d+$/);
      expect(labels[`traefik.http.middlewares.${middleware}.ratelimit.burst`]).toMatch(/^\d+$/);
    }
  });

  it('désigne chaque image applicative par son digest, jamais par une étiquette', () => {
    expect(Object.keys(stacks['staging']?.services ?? {}).sort()).toEqual(
      [...APPLICATION_SERVICES].sort(),
    );
    for (const name of APPLICATION_SERVICES) {
      expect(service('staging', name).image).toMatch(APPLICATION_IMAGE);
      expect(service('staging', name).image).toContain(`/trame-${name}@`);
    }
  });

  it('garde les images partagées au digest de dev.yml, celle de Keycloak comprise', async () => {
    expect(service('shared', 'postgres').image).toBe(devStackImage('postgres'));
    expect(service('shared', 'rabbitmq').image).toBe(devStackImage('rabbitmq'));

    const dockerfile = await readFile(KEYCLOAK_DOCKERFILE, 'utf8');
    const baseImages = [...dockerfile.matchAll(/^FROM (\S+)/gm)].map((match) => match[1]);
    expect(baseImages.length).toBeGreaterThan(0);
    for (const baseImage of baseImages) {
      expect(baseImage).toBe(devStackImage('keycloak'));
    }
  });

  it('démarre Keycloak préparé, en lecture seule, avec les realms montés en lecture seule', () => {
    const keycloak = service('shared', 'keycloak');

    expect(keycloak.build?.dockerfile).toBe('keycloak.Dockerfile');
    expect(keycloak.command).toEqual(['start', '--optimized', '--import-realm']);
    expect(keycloak.read_only).toBe(true);
    expect(keycloak.volumes).toContainEqual(
      expect.objectContaining({ target: '/opt/keycloak/data/import', read_only: true }),
    );
  });

  it('borne la mémoire et les journaux de chaque service, et le durcit', () => {
    for (const { stack, name, service: definition } of allServices()) {
      expect({
        service: `${stack}/${name}`,
        memoryLimited: Number(definition.mem_limit) > 0,
        logging: definition.logging,
        readOnly: definition.read_only,
        capabilities: definition.cap_drop,
        noNewPrivileges: definition.security_opt?.includes('no-new-privileges:true'),
      }).toEqual({
        service: `${stack}/${name}`,
        memoryLimited: true,
        logging: { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } },
        readOnly: true,
        capabilities: ['ALL'],
        noNewPrivileges: true,
      });
    }
  });

  it('redémarre chaque service, sauf le migrator, ponctuel', () => {
    for (const { stack, name, service: definition } of allServices()) {
      const expected = name === 'migrator' ? 'no' : 'unless-stopped';
      expect({ service: `${stack}/${name}`, restart: definition.restart }).toEqual({
        service: `${stack}/${name}`,
        restart: expected,
      });
    }
  });

  it('redémarre le front quand l’API est recréée, pour qu’il relaie vers la nouvelle', () => {
    // nginx résout `api` une seule fois, au démarrage. Recréée, l'API peut changer d'adresse, et
    // échanger la sienne avec un autre service recréé en même temps : le front relaierait /api/
    // vers un conteneur qui n'est plus l'API.
    expect(service('staging', 'web').depends_on?.['api']).toEqual({
      condition: 'service_healthy',
      restart: true,
      required: true,
    });
  });

  it('limite le moteur et le worker du staging à 1 CPU, 512 Mio et un seul worker CP-SAT', () => {
    for (const name of ['engine', 'worker']) {
      const definition = service('staging', name);
      expect(Number(definition.cpus)).toBe(1);
      expect(Number(definition.mem_limit)).toBe(512 * 1024 * 1024);
      expect(definition.environment?.['ENGINE_MAX_WORKERS']).toBe('1');
    }
  });

  it('configure l’OIDC du staging : émetteur public, clés lues sur le réseau interne', () => {
    expect(service('staging', 'api').environment).toMatchObject({
      OIDC_ISSUER_URL: 'https://auth.trame.wkhach.dev/realms/trame-staging',
      OIDC_JWKS_URL: 'http://keycloak:8080/realms/trame-staging/protocol/openid-connect/certs',
      OIDC_AUDIENCE: 'trame-api',
    });
    expect(service('staging', 'web').environment).toMatchObject({
      WEB_AUTH_SERVER_URL: 'https://auth.trame.wkhach.dev',
      WEB_AUTH_REALM: 'trame-staging',
      WEB_AUTH_CLIENT_ID: 'trame-web',
    });
    expect(service('shared', 'keycloak').environment).toMatchObject({
      KC_HOSTNAME: 'https://auth.trame.wkhach.dev',
      KC_PROXY_HEADERS: 'xforwarded',
    });
  });

  it('ne contient aucun secret : chaque variable sensible vient des modèles, vides', () => {
    let sensitiveVariables = 0;
    for (const { stack, name, service: definition } of allServices()) {
      for (const [variable, value] of Object.entries(definition.environment ?? {})) {
        if (SENSITIVE_VARIABLE.test(variable)) {
          sensitiveVariables++;
          expect({ service: `${stack}/${name}`, variable, value }).toEqual({
            service: `${stack}/${name}`,
            variable,
            value: '',
          });
        }
      }
    }
    expect(sensitiveVariables).toBeGreaterThan(0);
  });

  it('refuse de résoudre une stack sans dossier de secrets ou sans digest', async () => {
    const { TRAME_SECRETS_DIR: _secrets, ...withoutSecrets } = exampleVariables('shared');
    const { TRAME_API_DIGEST: _digest, ...withoutDigest } = exampleVariables('staging');

    await expect(resolvedStackConfig('shared', withoutSecrets)).rejects.toThrow(
      /TRAME_SECRETS_DIR/,
    );
    await expect(resolvedStackConfig('staging', withoutDigest)).rejects.toThrow(/TRAME_API_DIGEST/);
  });
});
