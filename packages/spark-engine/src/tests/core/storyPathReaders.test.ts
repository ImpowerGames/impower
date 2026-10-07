// No story path leaves the engine (#700). Outside the engine and the compiler a
// position is a source location, and an execution position an opaque address
// that the program's accessor gives for a line (`ProgramLocator.addressAt`)
// and places in the source (`locationOf`) (docs/engine/binary-program.md,
// section 8). This holds the boundary two ways: a search of every source file
// outside the engine and the compiler for the names a reader of story paths
// uses, with each reader the issue lists going through the accessor; and the
// game's execution report, which carries no path on the program engine.
import "@impower/sparkdown/src/inkjs/engine/Container";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { Game } from "../../game/core/classes/Game";
import { GameExecutedMessage } from "../../game/core/classes/messages/GameExecutedMessage";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

/** Where story paths may be read: the compiler, which builds the current
 *  engine's path locations, and the engine, which runs on them until the
 *  current engine is deleted. */
const ENGINE_AND_COMPILER = [
  "packages/sparkdown/src/compiler/",
  "packages/sparkdown/src/program/",
  "packages/sparkdown/src/inkjs/",
  "packages/sparkdown/src/binary/",
  "packages/spark-engine/src/game/",
];

/** The source trees of everything that runs outside them. */
const SOURCE_ROOTS = [
  "packages",
  "vscode-sparkdown/src",
  "vscode-sparkdown/webviews",
  "impower-dev/src",
  "sparkdown-player-app/src",
];

/** The names a reader of story paths uses: the path-location table and its
 *  lookups, the game's path fields and helpers before they became addresses,
 *  the messages' path fields, and the runtime pointers paths are read from. */
const PATH_READS = [
  /\bpathLocations\b/,
  /\bpathLocationTable\b/,
  /\bfindClosestPath(Location)?\b/,
  /\bpathToDocumentLocation\b/,
  /\bgetPathDocumentLocation\b/,
  /\bgetSimulateFromPath\b/,
  /\b(start|simulate|preview|previewed|executing|lastExecuted|simulated)Path\b/,
  /\bcurrentPathString\b/,
  /\bpreviousPointer\b/,
  /\bjumpToPath\b/,
  /\bSceneTracker\.sceneOf\b/,
  /\.path\?\.toString\(\)/,
];

const isSource = (file: string) =>
  /\.(ts|tsx|mts|js|mjs)$/.test(file) && !file.endsWith(".d.ts");

const isTest = (file: string) =>
  /(^|\/)tests?\//.test(file) || /\.test\.[a-z]+$/.test(file);

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === "node_modules" || name === "dist" || name === "out" || name.startsWith(".")) {
        continue;
      }
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        const file = relative(ROOT, full).split(sep).join("/");
        if (isSource(file) && !isTest(file)) {
          out.push(file);
        }
      }
    }
  };
  for (const root of SOURCE_ROOTS) {
    walk(join(ROOT, root));
  }
  return out.filter(
    (file) =>
      (!file.startsWith("packages/") || /^packages\/[^/]+\/src\//.test(file)) &&
      !ENGINE_AND_COMPILER.some((dir) => file.startsWith(dir)),
  );
};

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("a search of the sources outside the engine and the compiler", () => {
  const files = sourceFiles();

  it("covers the readers the issue lists and every package's sources", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "packages/spark-web-player/src/GamePlayerController.ts",
        "packages/spark-web-player/src/main/utils/previewHint.ts",
        "packages/sparkdown-language-server/src/sparkdown-language-server.ts",
        "packages/sparkdown-language-server/src/utils/providers/getOffsetSourceLocation.ts",
        "vscode-sparkdown/src/managers/SparkProgramManager.ts",
        "vscode-sparkdown/src/utils/activateCompilationView.ts",
        "packages/spark-engine/src/worker/installGameWorker.ts",
        "packages/spark-web-player/src/main/workers/installPlayerWorker.ts",
        "impower-dev/src/modules/spark-editor/components/preview-game/PreviewGame.tsx",
      ]),
    );
    expect(files.some((file) => file.startsWith("packages/spark-engine/src/game/"))).toBe(false);
    expect(files.length).toBeGreaterThan(500);
  });

  it("finds no story path read", () => {
    const reads: string[] = [];
    for (const file of files) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          for (const pattern of PATH_READS) {
            if (pattern.test(line)) {
              reads.push(`${file}:${i + 1}: ${line.trim()}`);
            }
          }
        });
    }
    expect(reads).toEqual([]);
  });

  it("finds each reader the issue lists going through the accessor", () => {
    const uses = (file: string, ...needles: string[]) =>
      needles.filter((needle) => !read(file).includes(needle));
    expect({
      previewHint: uses(
        "packages/spark-web-player/src/main/utils/previewHint.ts",
        "programLocator(",
        ".addressAt(",
        ".locationOf(",
      ),
      // The language server asks the accessor of the compiler's worker,
      // which holds the root its program is located by (#704).
      previousAndNextBeat: uses(
        "packages/sparkdown-language-server/src/utils/providers/getOffsetSourceLocation.ts",
        ".addressAt(",
        ".locationOf(",
      ),
      languageServer: uses(
        "packages/sparkdown-language-server/src/sparkdown-language-server.ts",
        ".locatorOf(",
        ".addressAt(",
        ".locationOf(",
      ),
      compilerWorker: uses(
        "packages/sparkdown/src/worker/installSparkdownWorker.ts",
        "answerLocateQueries(",
      ),
      programManager: uses(
        "vscode-sparkdown/src/managers/SparkProgramManager.ts",
        '"sparkdown/addressAt"',
        '"sparkdown/locationOf"',
      ),
      compilationView: uses(
        "vscode-sparkdown/src/utils/activateCompilationView.ts",
        ".addressAt(",
        ".locationOf(",
        "lastExecutedAddress",
      ),
      // The page holds no program: it shows the locations the game sends.
      playerPage: uses(
        "packages/spark-web-player/src/GamePlayerController.ts",
        "simulateLocation",
        "startLocation",
      ),
    }).toEqual({
      previewHint: [],
      previousAndNextBeat: [],
      languageServer: [],
      compilerWorker: [],
      programManager: [],
      compilationView: [],
      playerPage: [],
    });
  });
});

const MAIN = "file:///local/main.sd";

const TEXT = [
  "store trust = 0",
  "",
  "scene MAIN",
  "  Raffles waits by the door.",
  "  & trust = trust + 1",
  "  if trust > 0 then",
  "    Bunny arrives.",
  "  else",
  "    Nobody comes.",
  "  end",
  "  RAFFLES:",
  "    (quietly)",
  "    Come in.",
  "  The door closes.",
  "  -> ELSEWHERE",
  "end",
  "",
  "scene ELSEWHERE",
  "  A street at night.",
  "end",
  "",
].join("\n");

function compile(programChunks: boolean, startFrom: { file: string; line: number }) {
  const compiler = new SparkdownCompiler();
  let story: Story | undefined;
  compiler.addEventListener("compiler/didCompile", (params) => {
    story = params.story as Story | undefined;
  });
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: TEXT,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
    emitCompiledProgram: false,
    programChunks,
  });
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    const program = compiler.compile({ textDocument: { uri: MAIN }, startFrom } as never)
      .program as SparkProgram;
    return { program, story: story! };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

/** Every string a value holds, however deep. */
const strings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => strings(item, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => strings(item, out));
  }
  return out;
};

describe("the game's execution report on the program engine", () => {
  it("carries addresses and locations, and no story path", () => {
    const startFrom = { file: MAIN, line: TEXT.split("\n").indexOf("    Come in.") };
    // The story paths of the same program, which the current engine names
    // its positions by.
    const current = compile(false, startFrom).program;
    const paths = new Set(current.pathLocations!.paths);
    expect(paths.size).toBeGreaterThan(10);

    const { program, story } = compile(true, startFrom);
    expect(program.chunks).toBeDefined();
    expect(program.pathLocations).toBeUndefined();
    const game = new Game({
      now: () => 0,
      setTimeout: (handler: Function) => {
        handler();
        return 0;
      },
      resolve: (path: string) => path,
      fetch: async () => "",
      log: () => {},
      program,
      story,
      incrementalCheckpoints: true,
      verifyCheckpoints: false,
      programChunks: true,
      startFrom,
    } as never);
    const reports: Record<string, unknown>[] = [];
    game.connection.connectOutput((message) => {
      if (GameExecutedMessage.type.isNotification(message as never)) {
        reports.push((message as { params: Record<string, unknown> }).params);
      }
    });
    game.simulate();
    expect(game.simulation).toBe("success");
    game.start();
    for (let turns = 0; turns < 20; turns += 1) {
      game.clickedToContinue();
    }
    expect(reports.length).toBeGreaterThan(1);
    for (const report of reports) {
      expect(Object.keys(report).filter((key) => /path/i.test(key))).toEqual([]);
      expect(strings(report).filter((value) => paths.has(value))).toEqual([]);
      if (report["lastExecutedAddress"] !== undefined) {
        expect(typeof report["lastExecutedAddress"]).toBe("number");
      }
    }
    expect(reports.some((report) => typeof report["lastExecutedAddress"] === "number")).toBe(true);
    expect(reports.some((report) => report["simulateFlow"] === "MAIN")).toBe(true);
  });
});
