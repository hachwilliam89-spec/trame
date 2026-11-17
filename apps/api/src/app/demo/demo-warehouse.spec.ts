import { type DemoWarehouse, demoWarehouse } from './demo-warehouse';

const MONDAY = Temporal.PlainDate.from('2026-11-23');
const LOADED_ON = Temporal.PlainDate.from('2026-11-17');
const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);

function requiredCount(
  warehouse: DemoWarehouse,
  filter: (need: DemoWarehouse['needs'][number]) => boolean,
): number {
  let total = 0;
  for (const need of warehouse.needs) {
    if (filter(need)) {
      total += need.requiredCount;
    }
  }
  return total;
}

describe('jeu de démonstration : un entrepôt fictif', () => {
  const warehouse = demoWarehouse(MONDAY, LOADED_ON);

  it('décrit un site à Paris, trois postes et deux créneaux de 7 h effectives', () => {
    expect(warehouse.site).toEqual({
      code: 'DEMO',
      name: 'Entrepôt de démonstration',
      timeZone: 'Europe/Paris',
    });
    expect(warehouse.positions).toEqual([
      { key: 'forkliftDriver', name: 'Cariste', skills: ['caces3', 'caces5'] },
      { key: 'orderPicker', name: 'Préparateur de commandes', skills: ['caces1A'] },
      { key: 'receiver', name: 'Réceptionnaire', skills: ['caces1A'] },
    ]);
    for (const shiftTemplate of warehouse.shiftTemplates) {
      const minutes = shiftTemplate.start.until(shiftTemplate.end).total('minutes');
      expect(minutes - shiftTemplate.break.durationMinutes).toBe(420);
    }
  });

  it('demande 51 personnes du lundi au samedi, dont 12 caristes, avec un pic le lundi', () => {
    expect(requiredCount(warehouse, () => true)).toBe(51);
    expect(requiredCount(warehouse, (need) => need.position === 'forkliftDriver')).toBe(12);
    expect(requiredCount(warehouse, (need) => need.date.equals(MONDAY))).toBe(11);
    expect(warehouse.needs.every((need) => need.date.dayOfWeek <= 6)).toBe(true);
  });

  it('demande 3 caristes le samedi matin', () => {
    const saturdayMorning = warehouse.needs.filter(
      (need) =>
        need.date.equals(date('2026-11-28')) &&
        need.shift === 'morning' &&
        need.position === 'forkliftDriver',
    );

    expect(saturdayMorning).toEqual([expect.objectContaining({ requiredCount: 3 })]);
  });

  it('a 12 salariés : 3 caristes, 7 préparateurs, 2 réceptionnaires', () => {
    const forkliftDrivers = warehouse.employees.filter((employee) =>
      employee.qualifications.some((qualification) => qualification.skill === 'caces5'),
    );

    expect(warehouse.employees).toHaveLength(12);
    expect(forkliftDrivers).toHaveLength(3);
  });

  it('le CACES 3 d’une cariste expire le mercredi : elle ne peut plus conduire le samedi', () => {
    const sunday = date('2026-11-29');
    const expiringThisWeek: { lastName: string; skill: string; expiresOn: Temporal.PlainDate }[] =
      [];
    for (const employee of warehouse.employees) {
      for (const { skill, expiresOn } of employee.qualifications) {
        if (expiresOn !== undefined && Temporal.PlainDate.compare(expiresOn, sunday) <= 0) {
          expiringThisWeek.push({ lastName: employee.lastName, skill, expiresOn });
        }
      }
    }

    expect(expiringThisWeek).toEqual([
      { lastName: 'Fabre', skill: 'caces3', expiresOn: date('2026-11-25') },
    ]);
  });

  it('les contrats commencent au chargement : 10 de 28 h à 35 h, 2 temps partiels de 14 h à 21 h', () => {
    const contracts = warehouse.employees.map((employee) => employee.contract);
    const fullTime = contracts.filter((contract) => contract.weeklyMinutesMax === 35 * 60);
    const partTime = contracts.filter((contract) => contract.weeklyMinutesMax === 21 * 60);

    expect(contracts.every((contract) => contract.startsOn.equals(LOADED_ON))).toBe(true);
    expect(fullTime.every((contract) => contract.weeklyMinutesMin === 28 * 60)).toBe(true);
    expect(partTime.every((contract) => contract.weeklyMinutesMin === 14 * 60)).toBe(true);
    expect([fullTime.length, partTime.length]).toEqual([10, 2]);
  });
});
