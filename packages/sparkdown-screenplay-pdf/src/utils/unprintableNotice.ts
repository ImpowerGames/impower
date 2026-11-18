const LISTED = 20;

const MARK = /^\p{M}$/u;

const DOTTED_CIRCLE = String.fromCodePoint(0x25cc);

const shown = (character: string) => (MARK.test(character) ? DOTTED_CIRCLE + character : character);

export const unprintableNotice = (characters: readonly string[]): string => {
  if (characters.length === 0) {
    return "";
  }
  const listed = characters.slice(0, LISTED).map(shown).join(" ");
  const rest = characters.length - LISTED;
  return `Some characters can't be printed in the screenplay font and are blank in the PDF: ${listed}${rest > 0 ? ` and ${rest} more` : ""}`;
};
