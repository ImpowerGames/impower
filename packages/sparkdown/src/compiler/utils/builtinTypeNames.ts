let _builtinTypeNames: ReadonlySet<string> = new Set();

export const getBuiltinTypeNames = (): ReadonlySet<string> => _builtinTypeNames;

export const setBuiltinTypeNames = (names: Iterable<string>): void => {
  _builtinTypeNames = new Set(names);
};
