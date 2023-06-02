import normalize from "./normalize";

const normalizeAll = (tags: string[]): string[] => {
  if (!tags) {
    return tags;
  }
  return tags.map((x) => normalize(x)).filter((x) => Boolean(x));
};

export default normalizeAll;
