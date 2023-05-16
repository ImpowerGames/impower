export const convertToPascalCase = (s: string): string => {
  if (!s) {
    return s;
  }
  return (
    (s[0]?.toUpperCase() || "") +
    s.slice(1).replace(/[-_](\w\w$|\w)/g, (_, letter) => letter.toUpperCase())
  );
};
