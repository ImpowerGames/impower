export const getUniqueArray = (arr: string[]): string[] => {
  return Array.from(new Set(arr.map((x) => x.toLowerCase()))).sort();
};
