import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Git may check out the fixture with CRLF. CodeMirror uses LF, so normalize
// before tests compute character offsets. A missing fixture must fail the run.
export const LARGE_SCREENPLAY = readFileSync(
  resolve(__dirname, "large-screenplay.sd"),
  "utf8",
).replace(/\r\n?/g, "\n");
