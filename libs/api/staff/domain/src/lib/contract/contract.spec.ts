import { Contract, type ContractProperties, ensureNoOverlappingContract } from './contract';
import {
  InvalidContractPeriodError,
  InvalidWeeklyVolumeError,
  OverlappingContractError,
} from './contract.errors';

const MINUTES_PER_HOUR = 60;

function contractProperties(overrides: Partial<ContractProperties> = {}): ContractProperties {
  return {
    id: '0190f0a0-0000-7000-8000-0000000000f1',
    organizationId: '0190f0a0-0000-7000-8000-00000000000a',
    employeeId: '0190f0a0-0000-7000-8000-0000000000e1',
    weeklyMinutesMin: 28 * MINUTES_PER_HOUR,
    weeklyMinutesMax: 35 * MINUTES_PER_HOUR,
    startsOn: Temporal.PlainDate.from('2026-01-01'),
    endsOn: undefined,
    createdAt: Temporal.Instant.from('2026-11-15T08:00:00Z'),
    ...overrides,
  };
}

function contractOver(startsOn: string, endsOn?: string): Contract {
  return Contract.create(
    contractProperties({
      startsOn: Temporal.PlainDate.from(startsOn),
      endsOn: endsOn === undefined ? undefined : Temporal.PlainDate.from(endsOn),
    }),
  );
}

describe('Contract', () => {
  it('garde le volume hebdomadaire et la période d’un contrat sans date de fin', () => {
    const contract = Contract.create(contractProperties());

    expect(contract.weeklyMinutesMin).toBe(1680);
    expect(contract.weeklyMinutesMax).toBe(2100);
    expect(contract.startsOn.toString()).toBe('2026-01-01');
    expect(contract.endsOn).toBeUndefined();
  });

  it.each([
    ['un minimum égal au maximum', 2100, 2100],
    ['un minimum nul', 0, 2100],
    ['le maximum d’une semaine entière', 0, 10_080],
  ])('accepte %s', (_case, weeklyMinutesMin, weeklyMinutesMax) => {
    const properties = contractProperties({ weeklyMinutesMin, weeklyMinutesMax });

    expect(() => Contract.create(properties)).not.toThrow();
  });

  it.each([
    ['un minimum supérieur au maximum', 2101, 2100],
    ['un minimum négatif', -1, 2100],
    ['un maximum nul', 0, 0],
    ['un maximum de plus d’une semaine', 0, 10_081],
    ['des minutes non entières', 1680.5, 2100],
    ['un maximum non entier', 1680, 2100.5],
  ])('refuse %s', (_case, weeklyMinutesMin, weeklyMinutesMax) => {
    const properties = contractProperties({ weeklyMinutesMin, weeklyMinutesMax });

    expect(() => Contract.create(properties)).toThrow(InvalidWeeklyVolumeError);
  });

  it('refuse une date de fin antérieure à la date de début', () => {
    expect(() => contractOver('2026-06-01', '2026-05-31')).toThrow(InvalidContractPeriodError);
  });

  it('accepte un contrat d’un seul jour : la date de fin est incluse', () => {
    expect(() => contractOver('2026-06-01', '2026-06-01')).not.toThrow();
  });

  it.each([
    [
      'deux contrats qui se suivent',
      ['2026-01-01', '2026-06-30'],
      ['2026-07-01', '2026-12-31'],
      false,
    ],
    [
      'un contrat qui commence le dernier jour du précédent',
      ['2026-01-01', '2026-06-30'],
      ['2026-06-30', '2026-12-31'],
      true,
    ],
    [
      'un contrat inclus dans un autre',
      ['2026-01-01', '2026-12-31'],
      ['2026-03-01', '2026-03-31'],
      true,
    ],
    [
      'un contrat sans fin et un contrat ultérieur',
      ['2026-01-01', undefined],
      ['2030-01-01', '2030-12-31'],
      true,
    ],
    [
      'un contrat sans fin et un contrat terminé avant lui',
      ['2026-07-01', undefined],
      ['2026-01-01', '2026-06-30'],
      false,
    ],
    ['deux contrats sans fin', ['2026-01-01', undefined], ['2027-01-01', undefined], true],
  ] as const)('%s', (_case, first, second, expected) => {
    const firstContract = contractOver(first[0], first[1]);
    const secondContract = contractOver(second[0], second[1]);

    expect(firstContract.overlaps(secondContract)).toBe(expected);
    expect(secondContract.overlaps(firstContract)).toBe(expected);
  });

  it('refuse un contrat qui en chevauche un autre du même employé (US-032)', () => {
    const existing = [contractOver('2026-01-01', '2026-06-30')];

    expect(() => ensureNoOverlappingContract(existing, contractOver('2026-06-30'))).toThrow(
      OverlappingContractError,
    );
    expect(() => ensureNoOverlappingContract(existing, contractOver('2026-07-01'))).not.toThrow();
  });
});
