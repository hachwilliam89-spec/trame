import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import type { PlanningCatalog } from '@trame/web/scheduling/data-access';
import { planningView } from './planning-view';

const SITE = '0190f0a0-0000-7000-8000-0000000000d1';
const MORNING = '0190f0a0-0000-7000-8000-000000000011';
const AFTERNOON = '0190f0a0-0000-7000-8000-000000000012';
const FORKLIFT = '0190f0a0-0000-7000-8000-000000000021';
const PICKING = '0190f0a0-0000-7000-8000-000000000022';
const RECEIVING = '0190f0a0-0000-7000-8000-000000000023';
const CAMILLE = '0190f0a0-0000-7000-8000-000000000041';
const LUCAS = '0190f0a0-0000-7000-8000-000000000042';
const NADIA = '0190f0a0-0000-7000-8000-000000000043';
const THEO = '0190f0a0-0000-7000-8000-000000000044';
const INES = '0190f0a0-0000-7000-8000-000000000045';
const CREATED_AT = '2026-11-17T08:00:00.000Z';

function shift(date: string, template: string, position: string, requiredCount: number) {
  const morning = template === MORNING;
  return {
    id: `${date}/${template}/${position}`,
    date,
    shiftTemplateId: template,
    positionId: position,
    startsAt: `${date}T${morning ? '06:00' : '13:30'}:00+01:00`,
    endsAt: `${date}T${morning ? '13:20' : '20:50'}:00+01:00`,
    effectiveMinutes: 420,
    requiredSkillIds: [],
    requiredCount,
  };
}

const shifts = [
  shift('2026-11-23', MORNING, FORKLIFT, 1),
  shift('2026-11-23', MORNING, PICKING, 1),
  shift('2026-11-23', MORNING, RECEIVING, 1),
  shift('2026-11-24', AFTERNOON, PICKING, 1),
  shift('2026-11-28', MORNING, FORKLIFT, 2),
];
const contract = (minimumHours: number, maximumHours: number) => ({
  weeklyMinutesMin: minimumHours * 60,
  weeklyMinutesMax: maximumHours * 60,
});
const assignment = (shiftIndex: number, employeeId: string) => ({
  shiftId: shifts[shiftIndex]?.id ?? '',
  employeeId,
});

const generation = {
  id: '0190f0a0-0000-7000-8000-000000000099',
  siteId: SITE,
  weekStartsOn: '2026-11-23',
  status: 'SUCCEEDED',
  problem: {
    weekStartsOn: '2026-11-23',
    timeZone: 'Europe/Paris',
    shifts,
    employees: [
      { id: CAMILLE, qualifications: [], contract: contract(28, 35), unavailabilities: [] },
      {
        id: LUCAS,
        qualifications: [],
        contract: { ...contract(28, 35), absenceMinutes: 420 },
        // Absent le mardi entier : l'instantané garde la période, même supprimée depuis.
        unavailabilities: [
          { startsAt: '2026-11-24T00:00:00+01:00', endsAt: '2026-11-25T00:00:00+01:00' },
        ],
      },
      {
        id: NADIA,
        qualifications: [],
        contract: contract(14, 21),
        // Indisponible le mardi matin seulement : son après-midi reste affecté.
        unavailabilities: [
          { startsAt: '2026-11-24T06:00:00+01:00', endsAt: '2026-11-24T10:00:00+01:00' },
        ],
      },
    ],
    rules: [
      { id: 'HABILITATION_REQUISE' },
      { id: 'UN_SEUL_SHIFT' },
      { id: 'REPOS_QUOTIDIEN_MIN', minimumMinutes: 660 },
      { id: 'DUREE_QUOTIDIENNE_MAX', maximumMinutes: 600 },
      { id: 'DUREE_HEBDOMADAIRE_MAX', maximumMinutes: 2880 },
      { id: 'VOLUME_CONTRACTUEL' },
      { id: 'INDISPONIBILITE' },
    ],
    objective: { mode: 'STANDARD' },
  },
  excludedEmployees: [
    { employeeId: THEO, reason: 'NO_CONTRACT_COVERING_WEEK' },
    { employeeId: INES, reason: 'ABSENCE_VALUATION_TO_DEFINE' },
  ],
  outcome: {
    result: {
      status: 'OPTIMAL',
      schedule: {
        assignments: [
          assignment(0, CAMILLE),
          assignment(1, LUCAS),
          assignment(2, NADIA),
          assignment(3, NADIA),
          assignment(4, CAMILLE),
        ],
        shortfalls: [{ shiftId: shifts[4]?.id ?? '', requiredCount: 2, assignedCount: 1 }],
      },
    },
    checkedRules: [
      'HABILITATION_REQUISE',
      'REPOS_QUOTIDIEN_MIN',
      'VOLUME_CONTRACTUEL',
      'INDISPONIBILITE',
    ],
    solveSeconds: 0.2,
  },
} as unknown as ScheduleGenerationV1;

const person = (id: string, firstName: string, lastName: string) => ({
  id,
  siteId: SITE,
  firstName,
  lastName,
  qualifications: [],
  createdAt: CREATED_AT,
});
const catalog = {
  site: {
    id: SITE,
    code: 'DEMO',
    name: 'Entrepôt de démonstration',
    timeZone: 'Europe/Paris',
    createdAt: CREATED_AT,
  },
  positions: [
    { id: FORKLIFT, siteId: SITE, name: 'Cariste', skillIds: [], createdAt: CREATED_AT },
    {
      id: PICKING,
      siteId: SITE,
      name: 'Préparateur de commandes',
      skillIds: [],
      createdAt: CREATED_AT,
    },
    { id: RECEIVING, siteId: SITE, name: 'Réceptionnaire', skillIds: [], createdAt: CREATED_AT },
  ],
  shiftTemplates: [
    { id: AFTERNOON, label: 'Après-midi' },
    { id: MORNING, label: 'Matin' },
  ],
  employees: [
    person(NADIA, 'Nadia', 'Guérin'),
    person(LUCAS, 'Lucas', 'Girard'),
    person(CAMILLE, 'Camille', 'Laurent'),
    person(THEO, 'Théo', 'Marchand'),
    person(INES, 'Inès', 'Moreau'),
  ],
} as unknown as PlanningCatalog;

describe('modèle d’affichage du planning', () => {
  const view = planningView(generation, catalog);

  it('titre la semaine : site, numéro ISO, dates, jours sans besoin', () => {
    expect(view.siteName).toBe('Entrepôt de démonstration');
    expect(view.weekNumber).toBe(48);
    expect(view.rangeLabel).toBe('23–29 novembre 2026');
    expect(view.days.map((day) => day.name)).toEqual(['Lundi', 'Mardi', 'Samedi']);
    expect(view.daysWithoutNeeds).toEqual(['mercredi', 'jeudi', 'vendredi', 'dimanche']);
  });

  it('regroupe les horaires des créneaux dans la légende, lus dans l’instantané calculé', () => {
    expect(view.shiftKinds).toEqual([
      { shiftTemplateId: MORNING, label: 'Matin', hours: '06 h–13 h 20', tone: 1 },
      { shiftTemplateId: AFTERNOON, label: 'Après-midi', hours: '13 h 30–20 h 50', tone: 2 },
    ]);
  });

  it('donne une ligne par salarié du calcul, avec ses heures face à son contrat', () => {
    expect(
      view.team.map((row) => [row.name, row.positionsLabel, row.plannedLabel, row.contractLabel]),
    ).toEqual([
      ['Camille Laurent', 'Cariste', '14 h', 'Contrat 28–35 h'],
      ['Lucas Girard', 'Préparateur de commandes', '7 h', 'Contrat 28–35 h'],
      ['Nadia Guérin', 'Préparateur de commandes · Réceptionnaire', '14 h', 'Contrat 14–21 h'],
    ]);
  });

  it('BDD : lit les absences dans l’instantané, journée entière ou plage horaire, à côté des affectations', () => {
    expect(view.team.map((row) => [row.name, row.absences, row.absenceLabel])).toEqual([
      ['Camille Laurent', [[], [], []], undefined],
      ['Lucas Girard', [[], ['Absence'], []], '7 h d’absence · minimum restant 21 h'],
      ['Nadia Guérin', [[], ['Absence 06 h–10 h'], []], undefined],
    ]);
    expect(view.team[2]?.cells[1]?.map((cell) => cell.shiftLabel)).toEqual(['Après-midi']);
    expect(view.team[1]?.week.map((day) => day.absences)).toEqual([
      [],
      ['Absence'],
      [],
      [],
      [],
      [],
      [],
    ]);
  });

  it('BDD : chiffre la semaine du planning affiché, avec la durée du calcul et le nombre de règles vérifiées', () => {
    expect(view.summary).toEqual({
      assignedPlaces: 5,
      requiredPlaces: 6,
      coverageLabel: expect.stringMatching(/^83,3\s?%$/),
      missingPlaces: 1,
      missingDetail: 'sam. matin',
      plannedHoursLabel: '35 h',
      checkedRulesCount: 4,
      checkedRulesLabel: '4 règles',
      engineLabel: 'Proposé par le moteur · 0,2 s',
    });
  });

  it('montre le poste du jour dans la case seulement pour qui alterne entre deux postes', () => {
    const [camille, , nadia] = view.team;
    const camilleMonday = camille?.cells[0]?.[0];
    const nadiaMonday = nadia?.cells[0]?.[0];

    expect(camilleMonday).toMatchObject({
      shiftLabel: 'Matin',
      tone: 1,
      positionName: 'Cariste',
      showsPosition: false,
    });
    expect(camille?.cells[1]).toEqual([]);
    expect(nadiaMonday).toMatchObject({ positionName: 'Réceptionnaire', showsPosition: true });
    expect(nadia?.cells[1]?.[0]).toMatchObject({
      shiftLabel: 'Après-midi',
      tone: 2,
      positionName: 'Préparateur de commandes',
    });
    expect(nadiaMonday?.detail).toBe(
      'Nadia Guérin · Réceptionnaire · Lundi 23 · 06 h–13 h 20 · 7 h de travail effectif',
    );
  });

  it('donne la semaine entière de chaque salarié pour la vue Employé', () => {
    const camille = view.team[0];

    expect(
      camille?.week.map((entry) => [entry.dayLabel, entry.cells[0]?.shiftLabel ?? entry.note]),
    ).toEqual([
      ['Lundi 23', 'Matin'],
      ['Mardi 24', 'Non planifié'],
      ['Mercredi 25', 'Aucun besoin planifié'],
      ['Jeudi 26', 'Aucun besoin planifié'],
      ['Vendredi 27', 'Aucun besoin planifié'],
      ['Samedi 28', 'Matin'],
      ['Dimanche 29', 'Aucun besoin planifié'],
    ]);
  });

  it('chiffre la couverture et met en évidence le manque du samedi matin', () => {
    expect(view.coverage.assignedPlaces).toBe(5);
    expect(view.coverage.requiredPlaces).toBe(6);
    expect(view.coverage.percentLabel).toMatch(/^83,3\s?%$/);
    expect(view.coverage.gaps).toEqual([
      expect.objectContaining({
        dayLabel: 'Samedi 28',
        shiftLabel: 'Matin',
        positionName: 'Cariste',
        required: 2,
        assigned: 1,
        missing: 1,
        assignedNames: ['Camille Laurent'],
        hours: '06 h–13 h 20',
        countLabel: '1 affecté sur 2 · 1 manquant',
        assignedNamesLabel: 'Camille Laurent',
      }),
    ]);
  });

  it('détaille la couverture de chaque jour, par créneau puis par poste', () => {
    const monday = view.coverageByDay[0];

    expect(
      monday?.rows.map((row) => [row.shiftLabel, row.positionName, row.assigned, row.required]),
    ).toEqual([
      ['Matin', 'Cariste', 1, 1],
      ['Matin', 'Préparateur de commandes', 1, 1],
      ['Matin', 'Réceptionnaire', 1, 1],
    ]);
  });

  it('liste les règles vérifiées par le moteur, avec leur valeur et leur référence', () => {
    expect(view.rules).toEqual([
      {
        label: 'Habilitations exigées par le poste, valides le jour du créneau',
        reference: undefined,
      },
      {
        label: 'Repos quotidien d’au moins 11 h consécutives',
        reference: 'C. trav., art. L3131-1',
      },
      {
        label: 'Volume d’heures de chaque contrat, entre son minimum et son maximum',
        reference: 'Contrat de travail',
      },
      {
        label: 'Aucune affectation pendant une absence déclarée',
        reference: undefined,
      },
    ]);
  });

  it('nomme les salariés écartés du calcul et la raison', () => {
    expect(view.excluded).toEqual([
      { name: 'Théo Marchand', reason: 'aucun contrat ne couvre la semaine' },
      { name: 'Inès Moreau', reason: 'durée d’absence à définir' },
    ]);
  });
});
