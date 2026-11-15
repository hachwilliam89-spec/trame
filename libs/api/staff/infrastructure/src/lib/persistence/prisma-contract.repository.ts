import { Injectable } from '@nestjs/common';
import { type Prisma, PrismaService, dateToInstant, instantToDate } from '@trame/api/database';
import type { ContractRepository } from '@trame/api/staff/application';
import { Contract, ensureNoOverlappingContract } from '@trame/api/staff/domain';
import { type Page, type PageRequest, pageFrom } from '@trame/platform/pagination';
import { afterCursor } from './after-cursor';
import { dateToPlainDate, plainDateToDate } from './plain-date-conversions';

/** Contrats de travail dans `staff.contracts`. */
@Injectable()
export class PrismaContractRepository implements ContractRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(contract: Contract): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await lockEmployee(transaction, contract);
      const records = await transaction.contract.findMany({
        where: { organizationId: contract.organizationId, employeeId: contract.employeeId },
      });
      ensureNoOverlappingContract(records.map(toContract), contract);
      await transaction.contract.create({
        data: {
          id: contract.id,
          organizationId: contract.organizationId,
          employeeId: contract.employeeId,
          weeklyMinutesMin: contract.weeklyMinutesMin,
          weeklyMinutesMax: contract.weeklyMinutesMax,
          startsOn: instantToDate(startOfDayInUtc(contract.startsOn)),
          endsOn: plainDateToDate(contract.endsOn),
          createdAt: instantToDate(contract.createdAt),
        },
      });
    });
  }

  async listByEmployee(
    organizationId: string,
    employeeId: string,
    page: PageRequest,
  ): Promise<Page<Contract>> {
    const records = await this.prisma.contract.findMany({
      where: { organizationId, employeeId, id: afterCursor(page.after) },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    return pageFrom(records.map(toContract), page.limit);
  }
}

/**
 * Deux ajouts simultanés pour un même employé attendent leur tour sur la ligne de l'employé :
 * le second lit le contrat du premier avant de vérifier le chevauchement.
 */
async function lockEmployee(
  transaction: Prisma.TransactionClient,
  contract: Contract,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT id FROM staff.employees
    WHERE id = ${contract.employeeId}::uuid AND organization_id = ${contract.organizationId}::uuid
    FOR UPDATE
  `;
}

/** Une colonne `DATE` s'écrit comme l'instant de minuit UTC de ce jour. */
function startOfDayInUtc(date: Temporal.PlainDate): Temporal.Instant {
  return date.toZonedDateTime('UTC').toInstant();
}

function toContract(record: Prisma.ContractModel): Contract {
  return Contract.create({
    id: record.id,
    organizationId: record.organizationId,
    employeeId: record.employeeId,
    weeklyMinutesMin: record.weeklyMinutesMin,
    weeklyMinutesMax: record.weeklyMinutesMax,
    startsOn: dateToInstant(record.startsOn).toZonedDateTimeISO('UTC').toPlainDate(),
    endsOn: dateToPlainDate(record.endsOn),
    createdAt: dateToInstant(record.createdAt),
  });
}
