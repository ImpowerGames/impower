const article = (kind: string): string => (/^[aeiou]/.test(kind) ? "an" : "a");

export const clauseWordKindMessage = (name: string, kind: string, word: string): string =>
  `\`${name}\` is ${article(kind)} ${kind}: write \`${word} ${name}\``;

const CLAUSE_WORD_KIND_MESSAGE = /^`([^`]+)` is an? [_a-z]+: write `([a-z]+) \1`$/;

export const clauseWordKindFixOf = (message: string): { name: string; word: string } | undefined => {
  const match = CLAUSE_WORD_KIND_MESSAGE.exec(message);
  return match ? { name: match[1]!, word: match[2]! } : undefined;
};
