// The shift oracle (#938) on the binary program's chunks (#695): a cold
// compile of a project and a cold compile of it with blank lines above one of
// its scripts emit chunks equal by content, with that script's statements
// moved down by the blank lines. A chunk's line rows count from its
// statement's first line, so a shift changes no chunk but one that holds a
// name minted from a source offset, which every generated name the writer
// emits is kept from being. A project that falls back names the same
// construct, with its line moved the same way.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { blockCount } from "../../program/StatementChunk";
import {
  lines,
  SHIFT_CASES,
  type Project,
  type ShiftCase,
} from "../compiler/fixtures/shiftCases";
import { logicScreenplay } from "./logicScreenplay";
import { describeRoot, programCompiler } from "./programHarness";

const uriOf = (name: string) => `file://proj/${name}.sd`;

const SHIFTS = [1, 3];

function coldCompile(project: Project): SparkProgram {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    const texts = Object.fromEntries(
      Object.entries(project).map(([name, text]) => [uriOf(name), text]),
    );
    return programCompiler(texts, { programChunks: true }).compile(uriOf("main")).program;
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

/** A root by content without its positions: `describeRoot` with the line
 *  starts, first lines and spans left out. Every instruction reads each id
 *  as what it names, so a generated name that differs shows. */
const content = (root: ProgramRoot): string[] =>
  describeRoot(root).map((line) =>
    line
      .replace(/ first -?\d+ span \d+/, "")
      .replace(/^(declarations \S+) span \d+$/, "$1")
      .replace(/^(\s*)-?\d+ (?=-?\d+,)/, "$1"),
  );

/** Where each statement of a root stands: its script and first line, every
 *  flow's statements with each block statement before its bodies, and the
 *  first line of each body and of each flow but the top level's. */
const positions = (root: ProgramRoot): [string, number][] => {
  const out: [string, number][] = [];
  const visit = (sequence: SequenceRow) => {
    sequence.arrays.chunks.forEach((chunk, entry) => {
      out.push([sequence.uri, root.lineOf(sequence, entry)]);
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = root.body(chunk, k)!;
        out.push([body.uri, root.firstLineOf(body)]);
        visit(body);
      }
    });
  };
  const flows = root
    .flowSequences()
    .sort((a, b) => root.table.symbols[a.flow]!.localeCompare(root.table.symbols[b.flow]!));
  for (const flow of flows) {
    if (root.table.symbols[flow.flow] !== "") {
      out.push([flow.uri, root.firstLineOf(flow)]);
    }
    visit(flow);
  }
  for (const row of [...root.sequences()]
    .filter((row) => row.flow < 0)
    .sort((a, b) => a.uri.localeCompare(b.uri))) {
    visit(row);
  }
  return out;
};

function expectShiftInvariant(project: Project, name: string, shift: number) {
  const uri = uriOf(name);
  const plain = coldCompile(project);
  const shifted = coldCompile({ ...project, [name]: "\n".repeat(shift) + project[name]! });
  const moved = (at: string, line: number) => (at === uri ? line + shift : line);
  if (!plain.chunks) {
    expect(shifted.chunks).toBeUndefined();
    const fallback = plain.fallback!;
    expect(shifted.fallback).toEqual({ ...fallback, line: moved(fallback.uri, fallback.line) });
    return;
  }
  expect(shifted.fallback).toBeUndefined();
  expect(content(shifted.chunks!)).toEqual(content(plain.chunks));
  expect(positions(shifted.chunks!)).toEqual(
    positions(plain.chunks).map(([at, line]) => [at, moved(at, line)]),
  );
}

// Scripts whose statements the writer emits with names the compiler
// generates: a loop's hidden temporaries, a compound property assignment's
// and a multiple assignment's stashed values (the #912 family, here outside
// a function), each at the same offset of two scenes.
const PROGRAM_CASES: ShiftCase[] = [
  { name: "the logic screenplay", project: { main: logicScreenplay(2) } },
  {
    name: "#912's temps in scenes",
    project: {
      main: lines(
        "store t = { a = 0, b = 0 }",
        "",
        ...["s0", "s1"].flatMap((scene) => [
          `scene ${scene}`,
          "  t.a += 1",
          "  local x",
          "  x, t.b = 1, 2",
          "  Line {x} {t.a} {t.b}.",
          "end",
          "",
        ]),
      ),
    },
  },
  {
    name: "loop temporaries in scenes",
    project: {
      main: lines(
        "store r = 0",
        "",
        ...["s0", "s1"].flatMap((scene) => [
          `scene ${scene}`,
          "  for i = 1, 2 do",
          "    r = r + i",
          "  end",
          "  for _, v in { 1, 2 } do",
          "    r = r + v",
          "  end",
          "  while r < 10 do",
          "    r = r + 1",
          "  end",
          "  repeat",
          "    r = r - 1",
          "  until r < 5",
          "  Total {r}.",
          "end",
          "",
        ]),
      ),
    },
  },
];

describe("program shift equivalence", () => {
  for (const c of [...SHIFT_CASES, ...PROGRAM_CASES]) {
    for (const name of Object.keys(c.project)) {
      for (const n of SHIFTS) {
        it(`${c.name}: ${n} blank line${n === 1 ? "" : "s"} above ${name}.sd`, () =>
          expectShiftInvariant(c.project, name, n));
      }
    }
  }

  // The cases the writer emits chunks for, so that the oracle compares
  // chunks and not only the construct a program falls back for.
  it("compares the chunks of the programs that have them", () => {
    const chunked = [...SHIFT_CASES, ...PROGRAM_CASES]
      .filter((c) => coldCompile(c.project).chunks)
      .map((c) => c.name);
    expect(chunked).toEqual(
      expect.arrayContaining([
        "#912: compound and multi-target assignment temps",
        ...PROGRAM_CASES.map((c) => c.name),
      ]),
    );
  });
});
