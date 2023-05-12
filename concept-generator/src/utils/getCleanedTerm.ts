export const getCleanedTerm = (term: string): string => {
  return term
    .toLowerCase()
    .replace(/["^$%&\\(),.:;<=[\\\]`{|}]/g, "")
    .replace(/[>_~]/g, "")
    .replace(/[/]/g, " / ")
    .replace(/[+]/g, " + ")
    .replace(/[!]/g, " ! ")
    .replace(/[?]/g, " ? ")
    .replace(/[-]/g, " ");
};
