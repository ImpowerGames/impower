import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";
import { GameExecutedMessage } from "../../game/core/classes/messages/GameExecutedMessage";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

const ENGINE_AND_COMPILER = [
  "packages/sparkdown/src/compiler/",
  "packages/sparkdown/src/program/",
  "packages/sparkdown/src/inkjs/",
  "packages/sparkdown/src/runtime/",
  "packages/sparkdown/src/binary/",
  "packages/spark-engine/src/game/",
];

const SOURCE_ROOTS = [
  "packages",
  "vscode-sparkdown/src",
  "vscode-sparkdown/webviews",
  "impower-dev/src",
  "sparkdown-player-app/src",
];

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
      previousAndNextBeat: uses(
        "packages/sparkdown-language-server/src/utils/providers/getOffsetSourceLocation.ts",
        ".beatAt(",
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

function compile(startFrom: { file: string; line: number }) {
  const compiler = new SparkdownCompiler();
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
  });
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    const program = compiler.compile({ textDocument: { uri: MAIN }, startFrom } as never)
      .program as SparkProgram;
    return { program };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

describe("the game's execution report on the program engine", () => {
  it("carries addresses and locations, and no story path", () => {
    const startFrom = { file: MAIN, line: TEXT.split("\n").indexOf("    Come in.") };
    const { program } = compile(startFrom);
    expect(program.chunks).toBeDefined();
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
      if (report["lastExecutedAddress"] !== undefined) {
        expect(typeof report["lastExecutedAddress"]).toBe("number");
      }
    }
    expect(reports.some((report) => typeof report["lastExecutedAddress"] === "number")).toBe(true);
    expect(reports.some((report) => report["simulateFlow"] === "MAIN")).toBe(true);
  });
});
