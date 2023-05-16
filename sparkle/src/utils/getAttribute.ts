export const getAttribute = (str: string, name: string): string | undefined => {
  const regex = new RegExp(`${name}[ ]*=[ ]*[']([^']+)[']`);
  const matches = str.match(regex);
  if (!matches) {
    return undefined;
  }
  return matches[1];
};
