type SessionValues = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** `sessionStorage`, ou un stockage vide quand le navigateur le refuse (navigation privée). */
export function browserStorage(): SessionValues {
  try {
    return sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}
