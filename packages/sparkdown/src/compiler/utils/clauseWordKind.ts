const article = (kind: string): string => (/^[aeiou]/.test(kind) ? "an" : "a");

const CLAUSE_WORD_SWAPS: Readonly<Record<string, string>> = { with: "using", using: "with" };

export const clauseWordKindMessage = (name: string, kind: string, word: string): string =>
  `\`${name}\` is ${article(kind)} ${kind}: write \`${word} ${name}\``;

const CLAUSE_WORD_KIND_MESSAGE = /^`([^`]+)` is an? [_a-z]+: write `([a-z]+) \1`$/;

const USING_LINE_EXAMPLES: Readonly<Record<string, string>> = { load: "load chapter2", play: "play intro" };

export const usingLineMessage = (control: "load" | "play", transition?: string): string =>
  transition
    ? `A \`${control}\` line names its transition with \`using\`: write \`using ${transition}\``
    : `A \`${control}\` line names its transition with \`using\`\n> e.g. \`[[${USING_LINE_EXAMPLES[control]} using fade]]\``;

const USING_LINE_MESSAGE = /^A `(?:load|play)` line names its transition with `using`: write `using ([^`]+)`$/;

export const usingLineFixOf = (message: string): { transition: string } | undefined => {
  const match = USING_LINE_MESSAGE.exec(message);
  return match ? { transition: match[1]! } : undefined;
};

export const clauseWordKindFixOf = (
  message: string,
): { name: string; word: string; written: string } | undefined => {
  const match = CLAUSE_WORD_KIND_MESSAGE.exec(message);
  const written = match ? CLAUSE_WORD_SWAPS[match[2]!] : undefined;
  return match && written ? { name: match[1]!, word: match[2]!, written } : undefined;
};
