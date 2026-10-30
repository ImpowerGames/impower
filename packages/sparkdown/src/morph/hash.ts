import { hash64 } from "../program/hash64";

export const hashText = (text: string): string =>
  hash64(text)
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");
