// Every body of a statement emitted again in place takes its sequence id
// through the one source alignment, by the part that heads it (#1574,
// docs/engine/binary-program.md, section 2): a branch's condition or its
// `else`, a loop's header, a choice's line, a `then` clause, a function's own
// source. Never by position.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import {
  B_SEQUENCE,
  blockCount,
  blockField,
} from "../../program/StatementChunk";
import { MAIN_URI, programCompiler, rootChunks } from "./programHarness";

const silence = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** A compiler over one script that an edit replaces `before` with `after`
 *  in, one occurrence, and compiles again. */
const session = (text: string) => {
  const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
  let current = text;
  let version = 1;
  const first = silence(() => c.compile().program);
  expect(first.fallback).toBeUndefined();
  return {
    first: first.chunks!,
    store: () => c.compiler.chunkStore!,
    edit(before: string, after: string) {
      const at = current.indexOf(before);
      expect(at, before).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          {
            range: {
              start: posAt(current, at),
              end: posAt(current, at + before.length),
            },
            text: after,
          },
        ],
      });
      current = current.slice(0, at) + after + current.slice(at + before.length);
      const program = silence(() => c.compile().program);
      expect(program.fallback).toBeUndefined();
      return program.chunks!;
    },
  };
};

/** The sequence id and arrays of the body whose own listing shows `marker`
 *  (the innermost such body), or nothing. */
const bodyWith = (root: ProgramRoot, marker: string) => {
  const reader = new BinaryProgramReader(root);
  let found: { id: number; arrays: unknown; size: number } | undefined;
  for (const chunk of rootChunks(root)) {
    for (let k = 0; k < blockCount(chunk); k += 1) {
      const body = root.body(chunk, k);
      if (!body) continue;
      const listing = reader.listing(body).join("\n");
      if (listing.includes(marker) && (!found || listing.length < found.size)) {
        found = {
          id: blockField(chunk, k, B_SEQUENCE),
          arrays: body.arrays,
          size: listing.length,
        };
      }
    }
  }
  return found;
};

const ids = (root: ProgramRoot, markers: readonly string[]) =>
  Object.fromEntries(markers.map((m) => [m, bodyWith(root, m)?.id]));

describe("the then clauses of a choose block emitted again in place", () => {
  const text = [
    "-> main",
    "scene main",
    "  label top",
    "  choose",
    "    Caption {top}.",
    "    + Outer",
    "      Took outer.",
    "    + Leave",
    "      -> out",
    "  then",
    "    Outer then.",
    "    Outer then second.",
    "  end",
    "  -> top",
    "end",
    "scene out",
    "  Out.",
    "end",
    "",
  ].join("\n");

  it("keeps each clause's sequence id and arrays when a preamble block with its own then clause is inserted above, and a checkpoint inside the lower clause restores into it", () => {
    const s = session(text);
    const before = bodyWith(s.first, "Outer then.")!;
    expect(before).toBeDefined();
    // A checkpoint image taken inside the outer clause.
    const story = new ProgramStory(s.first);
    while (story.canContinue) story.Continue();
    story.ChooseChoiceIndex(
      story.currentChoices.findIndex((c) => c.text === "Outer"),
    );
    for (;;) {
      expect(story.canContinue).toBe(true);
      if (story.Continue() === "Outer then.\n") break;
    }
    const image = story.state.toJson();
    const edited = s.edit(
      "    + Outer\n",
      [
        "    choose",
        "      * Inner",
        "        Took inner.",
        "    then",
        "      Inner then.",
        "    end",
        "    + Outer",
        "",
      ].join("\n"),
    );
    const after = bodyWith(edited, "Outer then.")!;
    expect(after.id).toBe(before.id);
    expect(after.arrays).toBe(before.arrays);
    const inner = bodyWith(edited, "Inner then.")!;
    expect(inner.id).not.toBe(before.id);
    const restored = new ProgramStory(edited);
    restored.state.LoadJson(image);
    expect(restored.Continue()).toBe("Outer then second.\n");
    // And back: the inner clause's id is given up, the outer one kept.
    const removed = s.edit(
      [
        "    choose",
        "      * Inner",
        "        Took inner.",
        "    then",
        "      Inner then.",
        "    end",
        "",
      ].join("\n"),
      "",
    );
    expect(bodyWith(removed, "Outer then.")!.id).toBe(before.id);
    expect(bodyWith(removed, "Inner then.")).toBeUndefined();
  });
});

describe("the branches of an if emitted again in place", () => {
  const text = [
    "store n = 2",
    "-> main",
    "scene main",
    "  Before.",
    "  if n == 1 then",
    "    One.",
    "  elseif n == 2 then",
    "    Two.",
    "  elseif n == 3 then",
    "    Three.",
    "  else",
    "    Other.",
    "  end",
    "  After.",
    "end",
    "",
  ].join("\n");
  const markers = ["One.", "Two.", "Three.", "Other."];

  it("keeps every body's id with its heading part when a branch is inserted above another", () => {
    const s = session(text);
    const before = ids(s.first, markers);
    const edited = s.edit(
      "  elseif n == 2 then\n",
      "  elseif n == 5 then\n    Five.\n  elseif n == 2 then\n",
    );
    expect(ids(edited, markers)).toEqual(before);
    const five = bodyWith(edited, "Five.")!.id;
    expect(Object.values(before)).not.toContain(five);
  });

  it("keeps every body's id when a branch's condition is edited", () => {
    const s = session(text);
    const before = ids(s.first, markers);
    expect(ids(s.edit("n == 3 then", "n == 4 then"), markers)).toEqual(before);
  });

  it("keeps every body's id with its condition when two branches swap", () => {
    const s = session(text);
    const before = ids(s.first, markers);
    const edited = s.edit(
      "  elseif n == 2 then\n    Two.\n  elseif n == 3 then\n    Three.\n",
      "  elseif n == 3 then\n    Three.\n  elseif n == 2 then\n    Two.\n",
    );
    expect(ids(edited, markers)).toEqual(before);
  });

  it("gives up the id of a body whose part is gone, and a new part a new id", () => {
    const s = session(text);
    const before = ids(s.first, markers);
    const removed = s.edit("  elseif n == 2 then\n    Two.\n", "");
    const after = ids(removed, ["One.", "Three.", "Other."]);
    expect(after).toEqual({
      "One.": before["One."],
      "Three.": before["Three."],
      "Other.": before["Other."],
    });
    expect(bodyWith(removed, "Two.")).toBeUndefined();
    const added = s.edit(
      "  elseif n == 3 then\n",
      "  elseif n == 7 then\n    Seven.\n  elseif n == 3 then\n",
    );
    const seven = bodyWith(added, "Seven.")!.id;
    expect(Object.values(before)).not.toContain(seven);
    expect(ids(added, ["One.", "Three.", "Other."])).toEqual(after);
  });
});

describe("a loop and a function emitted again in place", () => {
  it("keeps a loop's body id when its header is edited", () => {
    const s = session(
      [
        "-> main",
        "scene main",
        "  Before.",
        "  for i = 1, 2 do",
        "    Loop {i}.",
        "  end",
        "  After.",
        "end",
        "",
      ].join("\n"),
    );
    const before = bodyWith(s.first, "Loop")!.id;
    expect(bodyWith(s.edit("1, 2 do", "1, 3 do"), "Loop")!.id).toBe(before);
  });

  it("keeps the body id of a function written inside a statement when the statement is edited", () => {
    const s = session(
      [
        "-> main",
        "scene main",
        "  Before.",
        "  local f, x = function()",
        "    return 4242",
        "  end, 1",
        "  Got {f() + x}.",
        "  After.",
        "end",
        "",
      ].join("\n"),
    );
    const before = bodyWith(s.first, "4242")!.id;
    expect(bodyWith(s.edit("end, 1", "end, 2"), "4242")!.id).toBe(before);
  });
});

describe("the record of how each body id was handed on", () => {
  it("names the alignment pass for every body id an emission in place kept, and none by position", () => {
    const s = session(
      [
        "store n = 2",
        "-> main",
        "scene main",
        "  Before.",
        "  if n == 1 then",
        "    One.",
        "  elseif n == 2 then",
        "    Two.",
        "  else",
        "    Other.",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    s.edit("  elseif n == 2 then\n", "  elseif n == 5 then\n    Five.\n  elseif n == 2 then\n");
    const record = s.store().handedOnLastBuild;
    expect(record.length).toBeGreaterThan(0);
    for (const entry of record) {
      expect(["aligned", "aligned-moved", "between", "new"]).toContain(entry.how);
    }
    expect(record.filter((e) => e.how !== "new")).toHaveLength(3);
  });
});
