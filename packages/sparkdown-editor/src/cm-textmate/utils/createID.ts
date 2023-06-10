// https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0#gistcomment-2694461
/** Very quickly generates a (non-secure) hash from the given string. */
export function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Creates a simple pseudo-random ID, with an optional prefix attached. */
export function createID(prefix = "") {
  const suffix = Math.abs(hash(Math.random() * 100 + prefix));
  return `${prefix}-${suffix}`;
}
