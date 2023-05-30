export const stripBlockComments = (str: string): string => {
  return str.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
};
