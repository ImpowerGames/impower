export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type PluralRule = (n: number) => PluralCategory;

const PLURAL_RULES: Record<string, PluralRule> = {
  en: (n) => (n === 1 ? "one" : "other"),

  fr: (n) => (n === 0 || n === 1 ? "one" : "other"),

  es: (n) => (n === 1 ? "one" : "other"),

  de: (n) => (n === 1 ? "one" : "other"),

  it: (n) => (n === 1 ? "one" : "other"),

  pt: (n) => (n === 0 || n === 1 ? "one" : "other"),

  ru: (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  },

  ja: () => "other",
  zh: () => "other",
  ko: () => "other",
  vi: () => "other",
  th: () => "other",

  ar: (n) => {
    if (n === 0) return "zero";
    if (n === 1) return "one";
    if (n === 2) return "two";
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return "few";
    if (mod100 >= 11 && mod100 <= 99) return "many";
    return "other";
  },

  cy: (n) => {
    if (n === 0) return "zero";
    if (n === 1) return "one";
    if (n === 2) return "two";
    if (n === 3) return "few";
    if (n === 6) return "many";
    return "other";
  },
};

export function getPluralCategory(
  count: number,
  language: string,
): PluralCategory {
  const n = Math.abs(count);
  const primary = language.toLowerCase().replace(/[_-].*$/, "");
  const rule = PLURAL_RULES[primary] ?? PLURAL_RULES["en"]!;
  return rule(n);
}
