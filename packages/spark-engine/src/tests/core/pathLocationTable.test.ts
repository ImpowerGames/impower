// #651 — a source line resolves to a story path by binary search over the
// program's columnar path-location table.
//
// The answers must match the linear scan over the program's path locations
// that the search replaces, so this test keeps that scan as an oracle and
// compares the two for EVERY line of a fixture covering what makes the search
// awkward:
//
//   - several scripts, so a lookup stays inside its own script;
//   - lines between statements and past the last one, which resolve to the
//     next statement rather than to a containing range;
//   - choice start content, whose path ends in `.$s` and resolves to the start
//     of the choice instead;
//   - a script whose only located paths are `__binding_*` evaluators, which a
//     preview must never divert into.

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  ProgramTransportDecoder,
  ProgramTransportEncoder,
} from "@impower/sparkdown/src/workspace/utils/programTransport";
import type {
  PathLocationTable,
  ScriptLocation,
} from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  locationAtRow,
  pathIndexBuilt,
  pathLocation,
  pathLocationTableOf,
} from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import { describe, expect, test } from "vitest";
import { findClosestPath } from "../../game/core/utils/findClosestPath";
import { findClosestPathLocation } from "../../game/core/utils/findClosestPathLocation";

const MAIN = "file://proj/main.sd";
const SCENES = "file://proj/scenes.sd";
const SCREEN = "file://proj/screen.sd";

const MAIN_SRC = `include scenes.sd
include screen.sd

store mood = "calm"

Raffles waits by the door.

scene A
  RAFFLES:
    Wow.

  With an indignant pivot, Raffles glides briskly ahead.

  choose
    * Go on
      He goes on.
      -> B
    * Stay put
      He stays.
      -> B
  end

  -> B
end
`;

const SCENES_SRC = `scene B
  BUNNY:
    Okay, okay!

  done
end

function Fn()
  local x = 1
end
`;

// Nothing here is narrative: every located path is a `__binding_*` evaluator
// the compiler hoists for the interpolation and the handler.
const SCREEN_SRC = `store email = ""
layout main with
  input #value={email} @input={ email = event.value }
  text "Mail: {email}"
end
`;

const NEWLINE = String.fromCharCode(10);

const SOURCES: Record<string, string> = {
  [MAIN]: MAIN_SRC,
  [SCENES]: SCENES_SRC,
  [SCREEN]: SCREEN_SRC,
};

const script = (uri: string, name: string, text: string) => ({
  uri,
  type: "script",
  name,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

const compile = () => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      script(MAIN, "main", MAIN_SRC),
      script(SCENES, "scenes", SCENES_SRC),
      script(SCREEN, "screen", SCREEN_SRC),
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
};

type Entry = [string, ScriptLocation];

const entriesOf = (table: PathLocationTable): Entry[] =>
  table.paths.map((path, row) => [path, locationAtRow(table, row)!]);

/** The linear scan the table's binary search replaces. */
const scanClosestLocation = (
  breakpoint: { file: string; line: number },
  entries: Entry[],
  scripts: string[],
): Entry | null => {
  const scriptIndex = scripts.indexOf(breakpoint.file);
  const relevant = entries.filter(([, l]) => l[0] === scriptIndex);
  for (let i = 0; i < relevant.length; i++) {
    const [, startLine, , endLine] = relevant[i]![1];
    if (breakpoint.line >= startLine && breakpoint.line <= endLine) {
      return relevant[i]!;
    }
    if (startLine > breakpoint.line && endLine > breakpoint.line) {
      return relevant[i]!;
    }
  }
  return null;
};

const isBindingPath = (path: string) =>
  path.includes("__binding_") &&
  path.split(".").some((seg) => seg.startsWith("__binding_"));

/** The linear scan `findClosestPath` replaces, `.$s` rule included. */
const scanClosestPath = (
  from: { file: string; line: number },
  entries: Entry[],
  scripts: string[],
) => {
  const previewable = entries.filter(([p]) => !isBindingPath(p));
  const [path] = scanClosestLocation(from, previewable, scripts) || [];
  const parentPath = path?.split(".").slice(0, -1).join(".");
  if (parentPath?.endsWith(".$s")) {
    return parentPath.split(".").slice(0, -1).join(".") + ".0";
  }
  return path ?? null;
};

describe("path locations resolve a source line by binary search", () => {
  const program = compile();
  const table = program.pathLocations!;
  const scripts = Object.keys(program.scripts);
  const entries = entriesOf(table);
  const sources = SOURCES;

  test("the fixture exercises what the search has to get right", () => {
    expect(scripts).toEqual(expect.arrayContaining([MAIN, SCENES, SCREEN]));
    expect(table.paths.length).toBeGreaterThan(20);
    // Choice start content, which resolves to the start of the choice.
    expect(table.paths.some((p) => p.includes(".$s"))).toBe(true);
    // A script whose located paths are all binding evaluators.
    const screenIndex = scripts.indexOf(SCREEN);
    const onScreen = entries.filter(([, l]) => l[0] === screenIndex);
    expect(onScreen.length).toBeGreaterThan(0);
    expect(onScreen.every(([p]) => isBindingPath(p))).toBe(true);
  });

  test("the rows are ordered by script, then start line, then start column", () => {
    for (let row = 1; row < table.paths.length; row++) {
      const prev = locationAtRow(table, row - 1)!;
      const here = locationAtRow(table, row)!;
      const ordered =
        prev[0] < here[0] ||
        (prev[0] === here[0] &&
          (prev[1] < here[1] || (prev[1] === here[1] && prev[2] <= here[2])));
      expect({ row, ordered }).toEqual({ row, ordered: true });
    }
  });

  test.each([MAIN, SCENES, SCREEN])(
    "every line of %s resolves to the same location as the scan",
    (file) => {
      const lineCount = sources[file]!.split(NEWLINE).length;
      for (let line = 0; line <= lineCount + 2; line++) {
        const found = findClosestPathLocation({ file, line }, table, scripts);
        const scanned = scanClosestLocation({ file, line }, entries, scripts);
        expect({ line, found }).toEqual({ line, found: scanned });
      }
    },
  );

  test.each([MAIN, SCENES, SCREEN])(
    "every line of %s resolves to the same preview path as the scan",
    (file) => {
      const lineCount = sources[file]!.split(NEWLINE).length;
      for (let line = 0; line <= lineCount + 2; line++) {
        const found = findClosestPath({ file, line }, table, scripts);
        const scanned = scanClosestPath({ file, line }, entries, scripts);
        expect({ line, found }).toEqual({ line, found: scanned });
      }
    },
  );

  test("a line owned by choice start content begins from the start of the choice", () => {
    // The `.$s` rule, on a table written to put such a row where a line
    // resolves to it: a path inside a choice's start content is not where a
    // preview begins — the choice itself is.
    const synthetic = pathLocationTableOf({
      "A.0": [0, 0, 0, 0, 8],
      "A.2.$s.0": [0, 4, 0, 4, 12],
      "A.2.$s.1": [0, 5, 0, 5, 12],
      "A.3": [0, 9, 0, 9, 8],
    });
    const files = [MAIN];
    expect(findClosestPath({ file: MAIN, line: 4 }, synthetic, files)).toBe(
      "A.2.0",
    );
    expect(findClosestPath({ file: MAIN, line: 5 }, synthetic, files)).toBe(
      "A.2.0",
    );
    // The rule reads the row's parent, so a row outside start content is
    // returned as it is.
    expect(findClosestPath({ file: MAIN, line: 9 }, synthetic, files)).toBe(
      "A.3",
    );
  });

  test("a script of nothing but bindings offers no preview path", () => {
    for (let line = 0; line < SCREEN_SRC.split(NEWLINE).length; line++) {
      expect(findClosestPath({ file: SCREEN, line }, table, scripts)).toBeNull();
    }
  });

  test("a file the program does not know resolves to nothing", () => {
    const absent = "file://proj/absent.sd";
    expect(findClosestPath({ file: absent, line: 0 }, table, scripts)).toBeNull();
    expect(
      findClosestPathLocation({ file: absent, line: 0 }, table, scripts),
    ).toBeNull();
  });

  test("the by-path accessor answers what the entries say", () => {
    for (const [path, location] of entries) {
      expect(pathLocation(table, path)).toEqual(location);
    }
    expect(pathLocation(table, "not.a.path")).toBeUndefined();
  });

  test("resolving lines never builds the by-path index", () => {
    const fresh = compile().pathLocations!;
    for (let line = 0; line < 20; line++) {
      findClosestPath({ file: MAIN, line }, fresh, scripts);
      findClosestPathLocation({ file: MAIN, line }, fresh, scripts);
    }
    expect(pathIndexBuilt(fresh)).toBe(false);
    pathLocation(fresh, fresh.paths[0]!);
    expect(pathIndexBuilt(fresh)).toBe(true);
  });
});

describe("the table crosses the worker boundary as it is", () => {
  test("the page resolves the same paths, with no object of all locations built", () => {
    const program = compile();
    const scripts = Object.keys(program.scripts);
    const received = new ProgramTransportDecoder().decode(
      structuredClone(new ProgramTransportEncoder().encode(program)),
    );
    const table = received.pathLocations!;

    // The ranges cross as one typed array and arrive as one.
    expect(table.values).toBeInstanceOf(Int32Array);
    expect(table.paths).toEqual(program.pathLocations!.paths);
    expect(pathIndexBuilt(table)).toBe(false);

    for (const file of [MAIN, SCENES, SCREEN]) {
      const lineCount = SOURCES[file]!.split(NEWLINE).length;
      for (let line = 0; line <= lineCount + 2; line++) {
        expect({
          file,
          line,
          path: findClosestPath({ file, line }, table, scripts),
        }).toEqual({
          file,
          line,
          path: findClosestPath({ file, line }, program.pathLocations, scripts),
        });
      }
    }
    // Resolving lines asks for no path, so the index by path is still absent.
    expect(pathIndexBuilt(table)).toBe(false);

    // A by-path lookup is what builds it.
    expect(pathLocation(table, table.paths[0]!)).toEqual(
      locationAtRow(program.pathLocations, 0),
    );
    expect(pathIndexBuilt(table)).toBe(true);
  });
});
