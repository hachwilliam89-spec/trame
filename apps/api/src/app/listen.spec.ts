import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { listenOnConfiguredAddress } from './listen';

@Module({})
class EmptyModule {}

describe("adresse d'écoute de l'API", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [EmptyModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("n'écoute que sur l'adresse configurée", async () => {
    // Port 0 : le système choisit un port libre, le test ne dépend pas du poste.
    await listenOnConfiguredAddress(app, { HOST: '127.0.0.1', PORT: 0 });

    const address = app.getHttpServer().address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
  });
});
