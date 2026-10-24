import { hash64 } from "../program/hash64";

/**
 * A 64-bit hash of `text` as 16 hex digits. It names artifacts and keys
 * caches synchronously on every host; it is not a defence against a crafted
 * collision.
 */
export const hashText = (text: string): string =>
  hash64(text)
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");
