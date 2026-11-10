const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const textFingerprint = (text: string): string => {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
};
