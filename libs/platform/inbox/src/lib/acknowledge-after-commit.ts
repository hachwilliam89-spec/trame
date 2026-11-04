/** Le transport ne confirme la livraison qu'une fois l'écriture validée. */
export async function acknowledgeAfterCommit(
  commit: () => Promise<void>,
  acknowledge: () => void,
): Promise<void> {
  await commit();
  acknowledge();
}
