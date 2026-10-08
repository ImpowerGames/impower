// The preview point both preview paths resolve through, so the page's own
// preview and the worker's display land on the same beat (#680, #758).
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { describe, expect, it } from "vitest";
import { resolvePreviewPoint } from "./resolvePreviewPoint";

const MAIN = "file:///local/main.sd";

/** A program compiled from a script with a line of story on each of `lines`
 *  and nothing on any other line, so that each of those lines owns an
 *  address of its own and no other line does. */
const programOf = (lines: number[]): SparkProgram => {
  const last = Math.max(0, ...lines);
  const text = Array.from({ length: last + 2 }, (_, line) =>
    lines.includes(line) ? `Line ${line}.` : "",
  ).join("\n");
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ],
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

/** The address line `line` of `program` owns, as the root resolves it. */
const addressOf = (program: SparkProgram, line: number): ProgramAddress => {
  const address = programLocator(program).addressAt(MAIN, line, { beat: "last" });
  if (address == null) {
    throw new Error(`line ${line} owns no address`);
  }
  return address;
};

const gameAt = (
  previewFrom: { file: string; line: number } | undefined,
  previewAddress: ProgramAddress | undefined,
  previewedAddress = previewAddress,
  state = "previewing",
) => ({ state, previewFrom, previewAddress, previewedAddress });

// The root is read through the program's accessor, so a program it cannot
// read would make every case below resolve to nothing.
const PROGRAM = programOf([10, 20]);
const AT_10 = addressOf(PROGRAM, 10);
const AT_20 = addressOf(PROGRAM, 20);

describe("resolving the point a preview shows", () => {
  it("takes the cursor's own address when its line resolves to one", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 10 }, AT_10),
    );
    expect(point.from).toEqual({ file: MAIN, line: 20 });
    expect(point.address).toBe(AT_20);
    expect(point.repeat).toBe(false);
  });

  it("keeps the last point previewed when the cursor resolves to none", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 900 },
      false,
      gameAt({ file: MAIN, line: 10 }, AT_10),
    );
    expect(point.from).toEqual({ file: MAIN, line: 10 });
    expect(point.address).toBe(AT_10);
  });

  it("previews the cursor itself when the project resolves no address at all", () => {
    const uiOnly = programOf([]);
    const point = resolvePreviewPoint(
      uiOnly,
      { file: MAIN, line: 4 },
      false,
      gameAt(undefined, undefined),
    );
    expect(point.from).toEqual({ file: MAIN, line: 4 });
    expect(point.address).toBeUndefined();
    // Nothing was ever previewed, so this is a first preview, not a repeat:
    // the connect it runs is what reveals a UI-only project's layouts.
    expect(point.repeat).toBe(false);
  });

  it("resolves the remembered point again when the program changed", () => {
    // The remembered line 10 now sits at a different address.
    const recompiled = programOf([5, 10, 20]);
    const moved = addressOf(recompiled, 10);
    expect(moved).not.toBe(AT_10);
    const point = resolvePreviewPoint(
      recompiled,
      { file: MAIN, line: 900 },
      true,
      gameAt({ file: MAIN, line: 10 }, AT_10),
    );
    expect(point.from).toEqual({ file: MAIN, line: 10 });
    expect(point.address).toBe(moved);
    expect(point.repeat).toBe(false);
  });

  it("keeps the old address when the recompiled program resolves the point to none", () => {
    // Both the cursor and the remembered point sit past every address the
    // new program has, so nothing resolves for either.
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 950 },
      true,
      gameAt({ file: MAIN, line: 900 }, AT_20),
    );
    // Nothing to mark, so the preview marks nothing…
    expect(point.address ?? null).toBeNull();
    // …but the old address stays, for the simulate-from point and for
    // telling a repeat from a first preview.
    expect(point.validAddress).toBe(AT_20);
  });

  it("is a repeat of the address the game already displayed", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 20 }, AT_20),
    );
    expect(point.repeat).toBe(true);
  });

  it("is not a repeat when the game previews a different address", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 10 }, AT_10),
    );
    expect(point.repeat).toBe(false);
  });

  it("is not a repeat when the program changed under the same address", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      true,
      gameAt({ file: MAIN, line: 20 }, AT_20),
    );
    expect(point.repeat).toBe(false);
  });

  it("is not a repeat when the game is not previewing", () => {
    const point = resolvePreviewPoint(
      PROGRAM,
      { file: MAIN, line: 20 },
      false,
      gameAt({ file: MAIN, line: 20 }, AT_20, AT_20, "running"),
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
    expect(point.address).toBe(AT_20);
    expect(point.repeat).toBe(false);
  });
});
