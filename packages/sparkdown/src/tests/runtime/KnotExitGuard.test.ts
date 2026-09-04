import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  planRoute,
  lastSearchStats,
} from "../../compiler/utils/planRoute";
import { Story } from "../../inkjs/engine/Story";

const URI = "inmemory:///main.sd";

function compile(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: URI },
    countAllVisits: true,
  });
  if (!result.program.compiled) {
    throw new Error(
      "fixture failed to compile: " +
        JSON.stringify(result.program.diagnostics),
    );
  }
  return {
    story: new Story(result.program.compiled as Record<string, any>),
    program: result.program,
  };
}

function pathsForLine(
  pathLocations: Record<string, [number, number]>,
  line: number,
): string[] {
  return Object.entries(pathLocations)
    .filter(([, loc]) => loc[1] === line)
    .map(([p]) => p);
}

function plan(
  story: Story,
  fromPath: string,
  toPath: string,
  functions: string[],
) {
  return planRoute(story, fromPath, toPath, {
    stayWithinKnot: true,
    functions,
  });
}

describe("knot-exit guard with tunnels and threads", () => {
  // Source lines (0-indexed):
  // 0: -> A
  // 1: (blank)
  // 2: scene A
  // 3:   First line in A.
  // 4:   -> B ->
  // 5:   Back in A after the tunnel.
  // 6:   <- C
  // 7:   After the thread in A.
  // 8:   Last line in A.
  // 9: end
  // 10: (blank)
  // 11: scene B
  // 12:   Inside B, the tunnel callee.
  // 13:   ->->
  // 14: end
  // 15: (blank)
  // 16: scene C
  // 17:   Inside C, the thread callee.
  // 18:   done
  // 19: end
  const FIXTURE = `\
-> A

scene A
  First line in A.
  -> B ->
  Back in A after the tunnel.
  <- C
  After the thread in A.
  Last line in A.
end

scene B
  Inside B, the tunnel callee.
  ->->
end

scene C
  Inside C, the thread callee.
  done
end
`;

  test("route to a line after a tunnel return is found", () => {
    const { story, program } = compile(FIXTURE);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;
    const paths = pathsForLine(locs, 5);
    expect(paths.length).toBeGreaterThan(0);
    const toPath = paths[0]!;
    const fromPath = "A";
    const result = plan(story, fromPath, toPath, functions);
    expect(result).not.toBeNull();
  });

  test("route to a line after a thread is found", () => {
    const { story, program } = compile(FIXTURE);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;
    const paths = pathsForLine(locs, 7);
    expect(paths.length).toBeGreaterThan(0);
    const toPath = paths[0]!;
    const fromPath = "A";
    const result = plan(story, fromPath, toPath, functions);
    expect(result).not.toBeNull();
  });

  test("route to the last line of the scene is found", () => {
    const { story, program } = compile(FIXTURE);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;
    const paths = pathsForLine(locs, 8);
    expect(paths.length).toBeGreaterThan(0);
    const toPath = paths[0]!;
    const fromPath = "A";
    const result = plan(story, fromPath, toPath, functions);
    expect(result).not.toBeNull();
  });

  test("route inside a tunnel callee is planned from the callee scene", () => {
    const { story, program } = compile(FIXTURE);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;
    const paths = pathsForLine(locs, 12);
    expect(paths.length).toBeGreaterThan(0);
    const toPath = paths[0]!;
    const fromPath = "B";
    const result = plan(story, fromPath, toPath, functions);
    expect(result).not.toBeNull();
  });

  test("route inside a thread callee is planned from the callee scene", () => {
    const { story, program } = compile(FIXTURE);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;
    const paths = pathsForLine(locs, 17);
    expect(paths.length).toBeGreaterThan(0);
    const toPath = paths[0]!;
    const fromPath = "C";
    const result = plan(story, fromPath, toPath, functions);
    expect(result).not.toBeNull();
  });
});

describe("knot-exit guard prunes one-way diverts", () => {
  // Source lines (0-indexed):
  // 0: -> A
  // 1: (blank)
  // 2: scene A
  // 3:   Line in A before the divert.
  // 4:   -> B
  // 5: end
  // 6: (blank)
  // 7: scene B
  // 8:   Line one in B.
  //  ... more lines in B ...
  // 17:  Line ten in B.
  // 18: end
  const FIXTURE_ONEWAY = `\
-> A

scene A
  Line in A before the divert.
  -> B
end

scene B
  Line one in B.
  Line two in B.
  Line three in B.
  Line four in B.
  Line five in B.
  Line six in B.
  Line seven in B.
  Line eight in B.
  Line nine in B.
  Line ten in B.
end
`;

  test("unreachable target in a scene with a one-way exit reports exhausted quickly", () => {
    const { story, program } = compile(FIXTURE_ONEWAY);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;

    const fromPath = "A";
    const bPaths = Object.keys(locs).filter((p) => p.startsWith("B."));
    expect(bPaths.length).toBeGreaterThan(0);
    const toPath = bPaths[bPaths.length - 1]!;

    const result = plan(story, fromPath, toPath, functions);
    expect(result).toBeNull();
    expect(lastSearchStats.endReason).toBe("exhausted");
    expect(lastSearchStats.stepsUsed).toBeLessThan(30);
  });

  test("reachable target before the one-way exit is found", () => {
    const { story, program } = compile(FIXTURE_ONEWAY);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;
    const paths = pathsForLine(locs, 3);
    expect(paths.length).toBeGreaterThan(0);
    const toPath = paths[0]!;
    const fromPath = "A";
    const result = plan(story, fromPath, toPath, functions);
    expect(result).not.toBeNull();
  });
});

describe("exitedKnot guard unit behavior", () => {
  test("guard returns true for a foreign knot with empty call stack (one-way divert)", () => {
    const FIXTURE = `\
-> X

scene X
  Line in X.
  -> Y
end

scene Y
  Line in Y.
end
`;
    const { story, program } = compile(FIXTURE);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;

    const fromPath = "X";
    const yPaths = Object.keys(locs).filter((p) => p.startsWith("Y."));
    expect(yPaths.length).toBeGreaterThan(0);
    const toPath = yPaths[0]!;

    const result = plan(story, fromPath, toPath, functions);
    expect(result).toBeNull();
  });

  test("guard returns false while the starting knot is on the call stack via tunnel", () => {
    const FIXTURE = `\
-> main

scene main
  Before tunnel.
  -> helper ->
  After tunnel.
end

scene helper
  Inside helper.
  ->->
end
`;
    const { story, program } = compile(FIXTURE);
    const functions = Object.keys(program.functionLocations || {});
    const locs = program.pathLocations as Record<string, [number, number]>;
    const paths = pathsForLine(locs, 5);
    expect(paths.length).toBeGreaterThan(0);
    const toPath = paths[0]!;
    const fromPath = "main";
    const result = plan(story, fromPath, toPath, functions);
    expect(result).not.toBeNull();
  });
});
