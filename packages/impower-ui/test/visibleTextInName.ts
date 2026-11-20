const words = (text: string): string[] =>
  text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\([^()]*\)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export const wordsContained = (shown: string, name: string): boolean => {
  const visibleWords = words(shown);
  const nameWords = words(name);
  return (
    visibleWords.length === 0 ||
    nameWords.some((_, start) => visibleWords.every((word, index) => nameWords[start + index] === word))
  );
};

export const visibleTextInName = (
  element: Element,
): { visibleWords: string[]; nameWords: string[]; contained: boolean } => {
  const shown = (element as HTMLElement).innerText ?? element.textContent ?? "";
  const name = element.getAttribute("aria-label") ?? shown;
  return { visibleWords: words(shown), nameWords: words(name), contained: wordsContained(shown, name) };
};
