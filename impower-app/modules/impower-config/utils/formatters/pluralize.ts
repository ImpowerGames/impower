export const pluralize = (
  value: number,
  locale?: string,
  ...args: string[]
): string => {
  const pluralRules = new Intl.PluralRules(locale);
  const selectedCategory = pluralRules.select(value);
  const possibleCategories = pluralRules.resolvedOptions().pluralCategories;
  const selectedIndex = possibleCategories.indexOf(selectedCategory);
  return args[selectedIndex];
};
