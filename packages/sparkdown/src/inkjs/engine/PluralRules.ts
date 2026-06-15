// CLDR plural-rules table. Each entry returns the plural category name
// ("zero" / "one" / "two" / "few" / "many" / "other") that the
// language's grammar uses for the given count `n`.
//
// The table is intentionally narrow — only the categories each language
// actually uses are reachable from its predicate. English uses just
// `one` and `other`; many languages use `one` and `other` too; Arabic
// uses all six. When a target language isn't registered here, the
// runtime falls back to English rules (returning `"one"` / `"other"`).
//
// Adding a new language is a single entry: register a predicate that
// maps `n` to a category name. Predicates receive the absolute value
// of `n` already (so they don't need to handle negatives) but see the
// raw int — fractional pluralization (`v`, `f`, `t` features in
// CLDR) isn't modeled yet; sparkdown numbers are integers in
// alternator contexts.
//
// Source: https://www.unicode.org/cldr/charts/45/supplemental/language_plural_rules.html

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type PluralRule = (n: number) => PluralCategory;

// Map of language-code → plural-rule predicate. Lookup is by exact
// match (e.g. `"en"`, `"fr"`, `"ar"`). Language subtags (`"en-US"`,
// `"pt-BR"`) are stripped to their primary subtag by
// `getPluralCategory` before the lookup.
const PLURAL_RULES: Record<string, PluralRule> = {
  // English: `one` for n=1, `other` for everything else (0, 2, 3, ...).
  // Note that English's "no items" is `other` ("0 apples"), not `zero` —
  // `zero` is a distinct category only in languages like Arabic and
  // Latvian. CLDR section "English (en)".
  en: (n) => (n === 1 ? "one" : "other"),

  // French: `one` for n ∈ {0, 1}, `other` for n ≥ 2. French treats
  // "0 pomme" / "1 pomme" as singular but "2 pommes" as plural —
  // distinct from English where "0 apples" is plural. CLDR section
  // "French (fr)".
  fr: (n) => (n === 0 || n === 1 ? "one" : "other"),

  // Spanish: same as English. `one` for n=1, `other` otherwise. CLDR
  // section "Spanish (es)".
  es: (n) => (n === 1 ? "one" : "other"),

  // German: same as English. `one` for n=1, `other` otherwise. CLDR
  // section "German (de)".
  de: (n) => (n === 1 ? "one" : "other"),

  // Italian: same as English. CLDR section "Italian (it)".
  it: (n) => (n === 1 ? "one" : "other"),

  // Portuguese: same as French (n ∈ {0, 1} → `one`). CLDR section
  // "Portuguese (pt)".
  pt: (n) => (n === 0 || n === 1 ? "one" : "other"),

  // Russian: three categories — `one` (n%10==1 && n%100!=11),
  // `few` (n%10∈{2,3,4} && n%100∉{12,13,14}), `many` (otherwise).
  // CLDR section "Russian (ru)".
  ru: (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  },

  // Japanese, Chinese, Korean, Vietnamese, Thai: no plural distinction.
  // All counts fall into `other`. CLDR sections "Japanese (ja)" etc.
  ja: () => "other",
  zh: () => "other",
  ko: () => "other",
  vi: () => "other",
  th: () => "other",

  // Arabic: all six categories.
  //   zero: n == 0
  //   one:  n == 1
  //   two:  n == 2
  //   few:  n % 100 ∈ [3, 10]
  //   many: n % 100 ∈ [11, 99]
  //   other: otherwise
  // CLDR section "Arabic (ar)".
  ar: (n) => {
    if (n === 0) return "zero";
    if (n === 1) return "one";
    if (n === 2) return "two";
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return "few";
    if (mod100 >= 11 && mod100 <= 99) return "many";
    return "other";
  },

  // Welsh: full six-category set, distinct predicates for each.
  // CLDR section "Welsh (cy)".
  cy: (n) => {
    if (n === 0) return "zero";
    if (n === 1) return "one";
    if (n === 2) return "two";
    if (n === 3) return "few";
    if (n === 6) return "many";
    return "other";
  },
};

// Returns the plural category for `count` in the given language.
// Negative counts are treated as their absolute value (the plural
// category of "-1 apple" is the same as "1 apple"). Unknown languages
// fall back to English rules. Language tags with subtags (e.g.
// `"en-US"`, `"pt-BR"`) are matched against their primary subtag.
export function getPluralCategory(
  count: number,
  language: string,
): PluralCategory {
  const n = Math.abs(count);
  // Strip subtag: `"en-US"` → `"en"`, `"pt_BR"` → `"pt"`.
  const primary = language.toLowerCase().replace(/[_-].*$/, "");
  const rule = PLURAL_RULES[primary] ?? PLURAL_RULES.en!;
  return rule(n);
}
