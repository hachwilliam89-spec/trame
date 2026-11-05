import { WebSession, AuthenticationRequired, type IdentityDriver } from './session';
const identity = { subject: 'user-A', organizationId: 'org-A', roles: ['manager'] };
function driver(): IdentityDriver {
  return {
    initialize: vi.fn(async () => true),
    identity: () => identity,
    accessToken: vi.fn(async () => 'token-in-memory'),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    onExpired: () => undefined,
  };
}
describe('Session web', () => {
  it('reconnaît l’identité après le retour Keycloak et fournit le jeton uniquement sur demande', async () => {
    const adapter = driver();
    const session = new WebSession(adapter);
    await session.initialize();
    expect(session.status()).toBe('authenticated');
    expect(session.identity()).toEqual(identity);
    expect(adapter.accessToken).not.toHaveBeenCalled();
    expect(await session.token()).toBe('token-in-memory');
  });
  it('efface l’identité et refuse tout appel après expiration', async () => {
    const adapter = driver();
    const session = new WebSession(adapter);
    await session.initialize();
    adapter.onExpired();
    expect(session.status()).toBe('expired');
    expect(session.identity()).toBeUndefined();
    await expect(session.token()).rejects.toBeInstanceOf(AuthenticationRequired);
  });
  it('reste anonyme sans session et distingue une panne du fournisseur', async () => {
    const adapter = driver();
    vi.mocked(adapter.initialize).mockResolvedValueOnce(false);
    const session = new WebSession(adapter);
    await session.initialize();
    expect(session.status()).toBe('anonymous');
    vi.mocked(adapter.initialize).mockRejectedValueOnce(new Error('sensitive details'));
    await session.initialize();
    expect(session.status()).toBe('unavailable');
    expect(session.identity()).toBeUndefined();
  });
});
