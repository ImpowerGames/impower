// #816 — the runtime errors and warnings a route replay raises travel with
// the route's answer, so the game that shows the start point can report
// them. After an edit below the author's line, the replay resumes from a
// checkpoint partway along the route rather than running it from the top, so
// what the steps before that checkpoint raised has to be kept rather than
// raised again.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, test } from "vitest";
import { RouteSearchLog, type RouteSearchReportTarget } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

const CONTINUES_WARNING =
  "This line begins with `..`, but the line before it had already ended.";

const lines = ["store x = 0", "A", "& x = 1", ".. B"];
for (let i = 0; i < 12; i += 1) {
  lines.push(`Beat ${i} of the long tail.`);
}
lines.push("");
const SOURCE = lines.join("\n");
const WARNED = lines.indexOf(".. B");
const TARGET = lines.indexOf("Beat 10 of the long tail.");
const EDITED = lines.indexOf("Beat 11 of the long tail.");

const quiet = <T>(fn: () => T): T => {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

describe.each([false, true])("route errors (worker displays: %s)", (workerDisplays) => {
  test("keep what the steps before a resumed replay's checkpoint raised", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      emitCompiledProgram: !workerDisplays,
      files: [
        { uri: URI, type: "script", name: "main", ext: "sd", text: SOURCE, version: 1, languageId: "sparkdown" },
      ],
    } as never);
    const config: { simulationOptions?: Record<string, any> } = {};
    let game: Game | undefined;
    const rounds: { errors: unknown; resumed: boolean }[] = [];
    compiler.addEventListener("compiler/didCompile", (params) => {
      const { program, story } = params;
      if (!game) {
        game = new Game({
          program,
          story,
          now: () => 0,
          setTimeout: ((fn: Function) => {
            fn();
            return 0;
          }) as never,
          incrementalCheckpoints: true,
          verifyCheckpoints: false,
        } as never);
      } else {
        game.updateProgram(program, story as never);
      }
      game.setStartFrom({ file: URI, line: TARGET });
      const toPath = game.startPath!;
      const resumption = game.routeResumption(Game.getSimulateFromPath(toPath), toPath);
      const log = new RouteSearchLog();
      searchRouteTo(game, toPath, log, { config: config as never });
      const report: RouteSearchReportTarget = {};
      log.report(report, toPath);
      rounds.push({
        errors: report.simulationErrors,
        resumed: resumption.stepIndex != null,
      });
    });

    quiet(() => compiler.compile({ textDocument: { uri: URI }, startFrom: { file: URI, line: TARGET } }));
    quiet(() =>
      compiler.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [
          {
            range: {
              start: { line: EDITED, character: 0 },
              end: { line: EDITED, character: 4 },
            },
            text: "Last",
          },
        ],
      } as never),
    );
    quiet(() => compiler.compile({ textDocument: { uri: URI }, startFrom: { file: URI, line: TARGET } }));

    const warned = [
      {
        message: CONTINUES_WARNING,
        type: 2,
        location: expect.objectContaining({
          uri: URI,
          range: expect.objectContaining({
            start: expect.objectContaining({ line: WARNED }),
          }),
        }),
      },
    ];
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toEqual({ errors: warned, resumed: false });
    // The edit is below the line, so the second replay resumed partway along.
    expect(rounds[1]).toEqual({ errors: warned, resumed: true });
  });
});
