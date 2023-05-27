const REGEX_PASCAL = /[-_](\w\w$|\w)/g;

export const convertToPascalCase = (s: string): string => {
  if (!s) {
    return s;
  }
  return (
    (s[0]?.toUpperCase() || "") +
    s.slice(1).replace(REGEX_PASCAL, (_, letter) => letter.toUpperCase())
  );
};
