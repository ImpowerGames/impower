const escapeURI = (
  str: string,
  replaceWithUnderscore?: string,
  lowercase?: boolean
): string => {
  const reg = replaceWithUnderscore
    ? new RegExp(`[${replaceWithUnderscore}]`, "g")
    : undefined;
  const cleanedStr = reg ? str.replace(reg, "_") : str;
  const transformedString = lowercase ? cleanedStr.toLowerCase() : cleanedStr;
  return encodeURIComponent(transformedString).replace(/[!'()*]/g, (c) => {
    return `%${c.charCodeAt(0).toString(16)}`;
  });
};

export default escapeURI;
