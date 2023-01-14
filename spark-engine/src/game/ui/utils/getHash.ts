export const getHash = (obj?: unknown): number => {
  let hash = 0;
  let i;
  let chr;
  if (obj == null) {
    return hash;
  }
  const json = JSON.stringify(obj);
  if (json.length === 0) {
    return hash;
  }
  for (i = 0; i < json.length; i += 1) {
    chr = json.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};
