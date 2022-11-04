import { BASE64_CHARS } from "./BASE64_CHARS";

export const BASE64_LOOKUP =
  typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}
