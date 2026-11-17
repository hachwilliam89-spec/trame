import { FixedClock } from '@trame/platform/clock';
import { PublicationNotConfirmedError } from '@trame/platform/messaging';
import { RefusedPublicationPause } from './transport-support';

describe('Pause d’un flux dont la publication est refusée', () => {
  let clock: FixedClock;
  let session: { isOpen: boolean };
  let refusals: string[];
  let pause: RefusedPublicationPause;

  beforeEach(() => {
    clock = new FixedClock('2026-11-17T00:00:00Z');
    session = { isOpen: true };
    refusals = [];
    pause = new RefusedPublicationPause(clock, session, (errorType) => refusals.push(errorType));
  });

  it('une file pleine suspend ce flux 5 s, sans interrompre la boucle', async () => {
    let attempts = 0;
    const refused = async () => {
      attempts += 1;
      throw new PublicationNotConfirmedError();
    };

    await pause.relay(refused);
    await pause.relay(refused);
    expect(attempts).toBe(1);
    expect(refusals).toEqual(['PublicationRefused']);

    clock.advance({ seconds: 5 });
    await pause.relay(refused);
    expect(attempts).toBe(2);
  });

  it('reprend normalement après une publication confirmée', async () => {
    let attempts = 0;
    await pause.relay(async () => {
      throw new PublicationNotConfirmedError();
    });
    clock.advance({ seconds: 5 });

    await pause.relay(async () => {
      attempts += 1;
    });
    await pause.relay(async () => {
      attempts += 1;
    });

    expect(attempts).toBe(2);
  });

  it('laisse remonter une session fermée ou une autre erreur, pour reconnecter', async () => {
    const otherError = new Error('panne');
    await expect(
      pause.relay(async () => {
        throw otherError;
      }),
    ).rejects.toBe(otherError);

    session.isOpen = false;
    await expect(
      pause.relay(async () => {
        throw new PublicationNotConfirmedError();
      }),
    ).rejects.toBeInstanceOf(PublicationNotConfirmedError);
  });
});
