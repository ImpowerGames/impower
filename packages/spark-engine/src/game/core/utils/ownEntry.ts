export const ownEntry = <T>(
  table: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined => (table && Object.hasOwn(table, key) ? table[key] : undefined);

export const ownList = <T>(table: Record<string, T[]>, key: string): T[] => {
  if (!Object.hasOwn(table, key)) {
    Object.defineProperty(table, key, {
      value: [],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return table[key]!;
};
