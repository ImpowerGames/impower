export const choose = (
  value: number,
  locale?: string,
  ...args: string[]
): string => {
  return args[value];
};
