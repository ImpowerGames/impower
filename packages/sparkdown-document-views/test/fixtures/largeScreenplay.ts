import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const LARGE_SCREENPLAY = readFileSync(
  resolve(__dirname, "large-screenplay.sd"),
  "utf8",
).replace(/\r\n?/g, "\n");
