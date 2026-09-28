/**
 * A 64-bit hash of a string as two signed 32-bit words, high word first, for
 * the fingerprint and layout hash of a statement chunk and the facts of a
 * reference table row. Two FNV-1a lanes with different offset bases, each
 * finished with MurmurHash3's avalanche. It is not a cryptographic hash: the
 * design asks only that two statements of one sequence do not read the same by
 * accident, which 64 bits make rare enough (section 1).
 */
export const hash64 = (text: string): [number, number] => {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193 + 0x100);
  }
  return [fmix32(a ^ text.length) | 0, fmix32(b) | 0];
};

const fmix32 = (h: number): number => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** The 32-bit hash of `text`, for a reference table row's facts. */
export const hash32 = (text: string): number => hash64(text)[1];
