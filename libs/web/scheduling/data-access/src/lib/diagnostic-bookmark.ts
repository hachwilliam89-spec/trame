import * as z from 'zod';
const bookmarkSchema = z.object({
  key: z.string().min(1).max(128),
  runId: z.uuid().optional(),
  cursor: z.uuid().optional(),
  sequence: z.int().nonnegative().default(0),
});
export type DiagnosticBookmark = z.infer<typeof bookmarkSchema>;
export class DiagnosticBookmarks {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  read(scope: string): DiagnosticBookmark | undefined {
    try {
      const text = this.storage.getItem(scope);
      if (text === null) return undefined;
      return bookmarkSchema.parse(JSON.parse(text));
    } catch {
      return undefined;
    }
  }
  write(scope: string, bookmark: DiagnosticBookmark): void {
    // Un stockage navigateur désactivé ne doit pas empêcher le calcul en mémoire.
    try {
      this.storage.setItem(scope, JSON.stringify(bookmark));
    } catch {
      /* Reprise limitée à l'onglet courant. */
    }
  }
}
