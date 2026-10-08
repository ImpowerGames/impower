// The fixtures of the differential run (every script under
// `src/tests/runtime/fixtures`, the beats fixture and the screenplays),
// which the program path's tests compile: `programDiagnosticsParity` holds
// their diagnostics to `ExportRuntime`'s, and `programWithoutGeneration`
// holds their compiles to generating nothing.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { autoGlobalScreenplay } from "./autoGlobalScreenplay";
import { chooseScreenplay } from "./chooseScreenplay";
import { displayScreenplay } from "./displayScreenplay";
import { flowScreenplay } from "./flowScreenplay";
import { captureScreenplay, functionScreenplay } from "./functionScreenplay";
import { logicScreenplay } from "./logicScreenplay";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "runtime", "fixtures");

const fixtureFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      fixtureFiles(full, out);
    } else if (name.endsWith(".sd")) {
      out.push(full);
    }
  }
  return out;
};

/** The fixtures of the differential run, by name. */
export const fixtures = (): [string, string][] => {
  const { files } = buildBeatsFixture({ lines: 300 });
  const beats = files.get("main.sd")!.replace("include scripts/characters\n", "");
  return [
    ...fixtureFiles(FIXTURES).map(
      (file): [string, string] => [relative(FIXTURES, file).split(sep).join("/"), readFileSync(file, "utf8")],
    ),
    ["beats", beats],
    ["display screenplay", displayScreenplay()],
    ["logic screenplay", logicScreenplay(3)],
    ["function screenplay", functionScreenplay(3)],
    ["capture screenplay", captureScreenplay(3)],
    ["flow screenplay", flowScreenplay(3)],
    ["choose screenplay", chooseScreenplay(3)],
    ["auto-global screenplay", autoGlobalScreenplay(4)],
  ];
};
