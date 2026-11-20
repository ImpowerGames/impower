const words = (text: string): string[] =>
  text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\([^()]*\)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export const visibleTextInName = (
  element: Element,
): { visibleWords: string[]; nameWords: string[]; contained: boolean } => {
  const visibleWords = words(element.textContent ?? "");
  const nameWords = words(element.getAttribute("aria-label") ?? element.textContent ?? "");
  const contained =
    visibleWords.length === 0 ||
    nameWords.some((_, start) => visibleWords.every((word, index) => nameWords[start + index] === word));
  return { visibleWords, nameWords, contained };
};
