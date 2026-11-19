import type { Contract } from '@trame/api/staff/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';

/** Contrats de travail enregistrés. Chaque lecture est limitée à une organisation. */
export interface ContractRepository {
  /**
   * Enregistre le contrat, sauf si sa période chevauche celle d'un autre contrat de l'employé :
   * lève alors `OverlappingContractError`. La vérification et l'écriture sont atomiques : deux
   * ajouts simultanés pour un même employé passent l'un après l'autre.
   */
  add(contract: Contract): Promise<void>;

  /** Contrat qui couvre toute la semaine, du lundi au dimanche ; `undefined` s'il n'y en a pas. */
  findCoveringWeek(
    organizationId: string,
    employeeId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<Contract | undefined>;

  /** Contrats de l'employé, par ordre de création. */
  listByEmployee(
    organizationId: string,
    employeeId: string,
    page: PageRequest,
  ): Promise<Page<Contract>>;
}
