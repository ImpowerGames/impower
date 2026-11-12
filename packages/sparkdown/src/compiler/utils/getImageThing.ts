const THING_END = /[@~:]/;

export const getImageThing = (name: string): string => {
  const end = name.search(THING_END);
  return end > 0 ? name.slice(0, end) : name;
};
