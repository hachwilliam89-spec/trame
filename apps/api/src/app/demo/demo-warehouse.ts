export type DemoSkillKey = 'caces1A' | 'caces3' | 'caces5';
export type DemoPositionKey = 'forkliftDriver' | 'orderPicker' | 'receiver';
export type DemoShiftKey = 'morning' | 'afternoon';

export interface DemoQualification {
  skill: DemoSkillKey;
  expiresOn: Temporal.PlainDate | undefined;
}

export interface DemoEmployee {
  firstName: string;
  lastName: string;
  qualifications: DemoQualification[];
  contract: { weeklyMinutesMin: number; weeklyMinutesMax: number; startsOn: Temporal.PlainDate };
}

export interface DemoNeed {
  date: Temporal.PlainDate;
  shift: DemoShiftKey;
  position: DemoPositionKey;
  requiredCount: number;
}

export interface DemoWarehouse {
  site: { code: string; name: string; timeZone: string };
  skills: { key: DemoSkillKey; name: string }[];
  positions: { key: DemoPositionKey; name: string; skills: DemoSkillKey[] }[];
  shiftTemplates: {
    key: DemoShiftKey;
    label: string;
    start: Temporal.PlainTime;
    end: Temporal.PlainTime;
    break: { start: Temporal.PlainTime; durationMinutes: number };
  }[];
  employees: DemoEmployee[];
  needs: DemoNeed[];
}

export const DEMO_TIME_ZONE = 'Europe/Paris';

/**
 * Bornes hebdomadaires d'un contrat à temps plein dans la démo. Un minimum de 28 h, plutôt que
 * 35 h, laisse au moteur la marge d'une semaine réaliste : à 35 h pour tous, la somme des minimums
 * dépasserait les places à pourvoir et la semaine deviendrait irréalisable.
 */
const FULL_TIME = { weeklyMinutesMin: 28 * 60, weeklyMinutesMax: 35 * 60 };

/**
 * Temps partiel de la démo, sous le minimum supplétif de 24 h (C. trav., art. L3123-27). Dérogation
 * fictive : chaque salarié concerné l'a demandée par écrit, en la motivant par des contraintes
 * personnelles (C. trav., art. L3123-7).
 */
const PART_TIME = { weeklyMinutesMin: 14 * 60, weeklyMinutesMax: 21 * 60 };

const time = (text: string): Temporal.PlainTime => Temporal.PlainTime.from(text);

/**
 * Entrepôt fictif d'une semaine de démonstration : un pic le lundi, et un samedi matin où trois
 * caristes sont demandés alors que le CACES 3 d'une des trois caristes a expiré le mercredi. Le
 * moteur ne peut en affecter que deux : c'est le manque que la démonstration explique.
 */
export function demoWarehouse(
  weekStartsOn: Temporal.PlainDate,
  loadedOn: Temporal.PlainDate,
): DemoWarehouse {
  return {
    site: { code: 'DEMO', name: 'Entrepôt de démonstration', timeZone: DEMO_TIME_ZONE },
    skills: [
      { key: 'caces1A', name: 'CACES R489 catégorie 1A' },
      { key: 'caces3', name: 'CACES R489 catégorie 3' },
      { key: 'caces5', name: 'CACES R489 catégorie 5' },
    ],
    positions: [
      { key: 'forkliftDriver', name: 'Cariste', skills: ['caces3', 'caces5'] },
      { key: 'orderPicker', name: 'Préparateur de commandes', skills: ['caces1A'] },
      // Le déchargement se fait au transpalette à conducteur porté, levée d'au plus 1,20 m :
      // catégorie 1A.
      { key: 'receiver', name: 'Réceptionnaire', skills: ['caces1A'] },
    ],
    shiftTemplates: [
      {
        key: 'morning',
        label: 'Matin',
        start: time('06:00'),
        end: time('13:20'),
        break: { start: time('10:00'), durationMinutes: 20 },
      },
      {
        key: 'afternoon',
        label: 'Après-midi',
        start: time('13:30'),
        end: time('20:50'),
        break: { start: time('17:00'), durationMinutes: 20 },
      },
    ],
    employees: demoEmployees(weekStartsOn, loadedOn),
    needs: demoNeeds(weekStartsOn),
  };
}

/** Habilitations valides des années après la semaine, sauf le CACES 3 d'Inès Fabre. */
function demoEmployees(
  weekStartsOn: Temporal.PlainDate,
  loadedOn: Temporal.PlainDate,
): DemoEmployee[] {
  const validFor = (years: number): Temporal.PlainDate => weekStartsOn.add({ years });
  const wednesday = weekStartsOn.add({ days: 2 });
  const fullTime = { ...FULL_TIME, startsOn: loadedOn };
  const partTime = { ...PART_TIME, startsOn: loadedOn };
  const employee = (
    firstName: string,
    lastName: string,
    qualifications: [DemoSkillKey, Temporal.PlainDate][],
    contract: DemoEmployee['contract'],
  ): DemoEmployee => ({
    firstName,
    lastName,
    qualifications: qualifications.map(([skill, expiresOn]) => ({ skill, expiresOn })),
    contract,
  });

  return [
    employee(
      'Camille',
      'Laurent',
      [
        ['caces3', validFor(3)],
        ['caces5', validFor(2)],
      ],
      fullTime,
    ),
    employee(
      'Yanis',
      'Morel',
      [
        ['caces3', validFor(1)],
        ['caces5', validFor(4)],
      ],
      fullTime,
    ),
    employee(
      'Inès',
      'Fabre',
      [
        ['caces3', wednesday],
        ['caces5', validFor(2)],
      ],
      partTime,
    ),
    employee('Lucas', 'Girard', [['caces1A', validFor(1)]], fullTime),
    employee('Sarah', 'Benali', [['caces1A', validFor(2)]], fullTime),
    employee('Hugo', 'Lemoine', [['caces1A', validFor(3)]], fullTime),
    employee('Léa', 'Rousseau', [['caces1A', validFor(4)]], fullTime),
    employee('Mehdi', 'Caron', [['caces1A', validFor(1)]], fullTime),
    employee('Chloé', 'Perrin', [['caces1A', validFor(2)]], fullTime),
    employee('Théo', 'Marchand', [['caces1A', validFor(3)]], partTime),
    employee('Nadia', 'Guérin', [['caces1A', validFor(4)]], fullTime),
    employee('Julien', 'Faure', [['caces1A', validFor(1)]], fullTime),
  ];
}

/** Personnes requises par jour : un pic le lundi, peu de caristes l'après-midi, dimanche fermé. */
function demoNeeds(weekStartsOn: Temporal.PlainDate): DemoNeed[] {
  const needs: DemoNeed[] = [];
  const need = (
    dayIndex: number,
    shift: DemoShiftKey,
    position: DemoPositionKey,
    requiredCount: number,
  ): void => {
    needs.push({ date: weekStartsOn.add({ days: dayIndex }), shift, position, requiredCount });
  };
  const MONDAY = 0;
  const SATURDAY = 5;

  need(MONDAY, 'morning', 'forkliftDriver', 2);
  need(MONDAY, 'morning', 'orderPicker', 4);
  need(MONDAY, 'morning', 'receiver', 1);
  need(MONDAY, 'afternoon', 'forkliftDriver', 1);
  need(MONDAY, 'afternoon', 'orderPicker', 3);
  // Mardi à vendredi : un cariste le matin ; l'après-midi, seulement le mardi et le mercredi.
  for (let dayIndex = 1; dayIndex <= 4; dayIndex += 1) {
    need(dayIndex, 'morning', 'forkliftDriver', 1);
    need(dayIndex, 'morning', 'orderPicker', 3);
    need(dayIndex, 'morning', 'receiver', 1);
    if (dayIndex <= 2) {
      need(dayIndex, 'afternoon', 'forkliftDriver', 1);
    }
    need(dayIndex, 'afternoon', 'orderPicker', 3);
  }
  need(SATURDAY, 'morning', 'forkliftDriver', 3);
  need(SATURDAY, 'morning', 'orderPicker', 2);
  need(SATURDAY, 'morning', 'receiver', 1);
  return needs;
}
