import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseReadiness } from '@trame/api/database';
import { JwksTestServer } from '@trame/platform/auth/testing';
import { type CryptoKey, SignJWT, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';

const ISSUER = 'https://idp.test/realms/trame';
const AUDIENCE = 'trame-api';
const ORGANIZATION_ID = '0192f3a4-7b8c-7d10-8e2f-3a4b5c6d7e8f';

// L'API vérifie les jetons avec la configuration de son environnement : l'adresse du JWKS n'est
// connue qu'une fois le serveur de test démarré, d'où l'import d'AppModule après ce démarrage.
describe('API : jetons OIDC', () => {
  let jwks: JwksTestServer;
  let privateKey: CryptoKey;
  let app: INestApplication;

  async function accessToken(roles: string[], key: CryptoKey = privateKey): Promise<string> {
    return new SignJWT({ typ: 'Bearer', organization_id: ORGANIZATION_ID, roles })
      .setProtectedHeader({ alg: 'RS256', kid: 'cle-1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('utilisateur-opaque-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    privateKey = keyPair.privateKey;
    const publicJwk = { ...(await exportJWK(keyPair.publicKey)), kid: 'cle-1', alg: 'RS256' };
    jwks = await JwksTestServer.start([publicJwk]);

    process.env['OIDC_ISSUER_URL'] = ISSUER;
    process.env['OIDC_AUDIENCE'] = AUDIENCE;
    process.env['OIDC_JWKS_URL'] = jwks.url.href;
    const { AppModule } = await import('./app.module');
    const { configureApp } = await import('./configure-app');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseReadiness)
      .useValue({ name: 'database', check: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('répond 401 avec WWW-Authenticate: Bearer, sans jeton', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/sites');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('reconnaît un jeton valide : un employé reçoit 403 en créant un site, pas 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/sites')
      .set('authorization', `Bearer ${await accessToken(['employee'])}`)
      .send({ code: 'COL', name: 'Colmar', timeZone: 'Europe/Paris' });

    expect(response.status).toBe(403);
  });

  it('refuse un jeton signé par une autre clé', async () => {
    const otherKey = (await generateKeyPair('RS256')).privateKey;

    const response = await request(app.getHttpServer())
      .get('/api/v1/sites')
      .set('authorization', `Bearer ${await accessToken(['admin'], otherKey)}`);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
});
