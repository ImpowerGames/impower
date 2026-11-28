const article = (kind: string): string => (/^[aeiou]/.test(kind) ? "an" : "a");

const CLAUSE_WORD_SWAPS: Readonly<Record<string, string>> = { with: "using", using: "with" };

export const clauseWordKindMessage = (name: string, kind: string, word: string): string =>
  `\`${name}\` is ${article(kind)} ${kind}: write \`${word} ${name}\``;

const CLAUSE_WORD_KIND_MESSAGE = /^`([^`]+)` is an? [_a-z]+: write `([a-z]+) \1`$/;

export const clauseWordKindFixOf = (
  message: string,
): { name: string; word: string; written: string } | undefined => {
  const match = CLAUSE_WORD_KIND_MESSAGE.exec(message);
  const written = match ? CLAUSE_WORD_SWAPS[match[2]!] : undefined;
  return match && written ? { name: match[1]!, word: match[2]!, written } : undefined;
};
