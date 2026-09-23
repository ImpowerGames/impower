// The preview point both preview paths resolve through, so the page's own
// preview and the worker's display land on the same beat (#680, #758).
import { pathLocationTableOf } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import { describe, expect, it } from "vitest";
import { resolvePreviewPoint } from "./resolvePreviewPoint";

const MAIN = "file:///local/main.sd";

/** A program whose every listed line owns a path of its own, in the packed
 *  table the compiler ships. */
const programOf = (lines: Record<number, string>) => ({
  scripts: { [MAIN]: 1 },
  pathLocations: pathLocationTableOf(
    Object.fromEntries(
      Object.entries(lines).map(([line, path]) => [
        path,
        [0, Number(line), 0, Number(line), 9] as [
          number,
          number,
          number,
          number,
          number,
        ],
      ]),
    ),
  ),
});

const gameAt = (
  previewFrom: { file: string; line: number } | undefined,
  previewPath: string | undefined,
  previewedPath = previewPath,
  state = "previewing",
) => ({ state, previewFrom, previewPath, previewedPath });

// The path table is read through the engine's own resolver, so a program
// shape it cannot read would make every case below resolve to nothing.
const PROGRAM = programOf({ 10: "main.10", 20: "main.20" });

describe("resolving the point a preview shows", () => {
  it("takes the cursor's own path when its line resolves to one", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 10 }, "main.10"),
    );
    expect(point.from).toEqual({ file: MAIN, line: 20 });
    expect(point.path).toBe("main.20");
    expect(point.repeat).toBe(false);
  });

  it("keeps the last point previewed when the cursor resolves to none", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 900 },
      false,
      gameAt({ file: MAIN, line: 10 }, "main.10"),
    );
    expect(point.from).toEqual({ file: MAIN, line: 10 });
    expect(point.path).toBe("main.10");
  });

  it("previews the cursor itself when the project resolves no path at all", () => {
    const uiOnly = { scripts: { [MAIN]: 1 }, pathLocations: programOf({}).pathLocations };
    const point = resolvePreviewPoint(
      uiOnly,
      { file: MAIN, line: 4 },
      false,
      gameAt(undefined, undefined),
    );
    expect(point.from).toEqual({ file: MAIN, line: 4 });
    expect(point.path).toBeUndefined();
    // Nothing was ever previewed, so this is a first preview, not a repeat:
    // the connect it runs is what reveals a UI-only project's layouts.
    expect(point.repeat).toBe(false);
  });

  it("resolves the remembered point again when the program changed", () => {
    // The remembered line 10 now sits at a different path.
    const recompiled = programOf({ 10: "main.10b", 20: "main.20" });
    const point = resolvePreviewPoint(
      recompiled,
      { file: MAIN, line: 900 },
      true,
      gameAt({ file: MAIN, line: 10 }, "main.10"),
    );
    expect(point.from).toEqual({ file: MAIN, line: 10 });
    expect(point.path).toBe("main.10b");
    expect(point.repeat).toBe(false);
  });

  it("keeps the old path when the recompiled program resolves the point to none", () => {
    // Both the cursor and the remembered point sit past every path the new
    // program has, so nothing resolves for either.
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 950 },
      true,
      gameAt({ file: MAIN, line: 900 }, "main.20"),
    );
    // Nothing to mark, so the preview marks nothing…
    expect(point.path ?? null).toBeNull();
    // …but the old path stays, for the simulate-from point and for telling a
    // repeat from a first preview.
    expect(point.validPath).toBe("main.20");
  });

  it("is a repeat of the path the game already displayed", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 20 }, "main.20"),
    );
    expect(point.repeat).toBe(true);
  });

  it("is not a repeat when the game previews a different path", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 10 }, "main.10"),
    );
    expect(point.repeat).toBe(false);
  });

  it("is not a repeat when the program changed under the same path", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      true,
      gameAt({ file: MAIN, line: 20 }, "main.20"),
    );
    expect(point.repeat).toBe(false);
  });

  it("is not a repeat when the game is not previewing", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 20 }, "main.20", "main.20", "running"),
    );
    expect(point.repeat).toBe(false);
  });

  it("is not a repeat when there is no game yet", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      undefined,
    );
    expect(point.from).toEqual({ file: MAIN, line: 20 });
    expect(point.path).toBe("main.20");
    expect(point.repeat).toBe(false);
  });
});
