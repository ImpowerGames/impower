import { CompilerDiagnostic } from "../../types/CompilerDiagnostic";

export const pluralize = (
  value: number,
  locale?: string,
  ...args: string[]
): [string, CompilerDiagnostic[], number[]] => {
  const diagnostics: CompilerDiagnostic[] = [];
  const pluralRules = new Intl.PluralRules(locale);
  const selectedCategory = pluralRules.select(value);
  const possibleCategories = pluralRules.resolvedOptions().pluralCategories;
  const selectedIndex = possibleCategories.indexOf(selectedCategory);
  const result = args[selectedIndex] || "";
  if (args.length < possibleCategories.length) {
    const params = args.join("|");
    diagnostics.push({
      content: params,
      from: 0,
      to: params.length,
      severity: "error",
      message: `All possible pluralizations must be specified: ${possibleCategories.join(
        "|"
      )}`,
    });
  }
  return [result, diagnostics, []];
};
