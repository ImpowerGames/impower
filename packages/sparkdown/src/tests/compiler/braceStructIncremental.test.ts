import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// #1223: typing a `}` inside a brace body, and deleting it again, changes
// which lines the blocks around it hold, as far as the declaration's `end`.
// An incremental compile after each keystroke must give the program a cold
// compile of the same text gives.

const URI = "inmemory:///main.sd";

const SOURCE = `scene main
  Hello.
end

animation fade with
  keyframes {
    from { opacity = 0 }
    40% { opacity = 0.5 }
    to { opacity = 1 }
  }
  timing {
    duration = 0.4
    easing = ease-in-out
  }
end

style button with
  cursor = pointer
  &.secondary { background-color = slate_50 }
  @hovered, @pressed {
    background-color = sky_50
  }
end

morph blink with
  method = bend
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = closed } }
  }
end

scene after
  Goodbye.
end
`;

function pick(p: any) {
  return {
    compiled: p.compiled,
    context: p.context,
    diagnostics: p.diagnostics,
    ui: p.ui,
    pathLocations: p.pathLocations,
    dataLocations: p.dataLocations,
  };
}

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

const file = (text: string, version: number) => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

function coldCompile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({ files: [file(text, 1)] } as any);
  return pick(c.compile({ textDocument: { uri: URI } }).program);
}

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

// Where the extra `}` goes, and the `}` that is then stray (zero-based line
// and character): the typed one when it closes nothing, otherwise the `}`
// that used to close the block the typed one now closes.
const EDITS = [
  { name: "after a keyframe position", after: "from { opacity = 0 }", stray: { line: 9, character: 2 } },
  { name: "after a style selector block", after: "&.secondary { background-color = slate_50 }", stray: { line: 18, character: 45 } },
  { name: "after a morph container", after: "from { eyes { state = open } }", stray: { line: 29, character: 2 } },
  { name: "inside a multi-line block", after: "    duration = 0.4", stray: { line: 13, character: 2 } },
];

/** The `Invalid syntax` errors of a compiled program, by start position. */
function invalidSyntax(program: ReturnType<typeof pick>) {
  return ((program.diagnostics as any)?.[URI] ?? [])
    .filter((d: any) => (typeof d.message === "string" ? d.message : d.message.value) === "Invalid syntax")
    .map((d: any) => ({ line: d.range.start.line, character: d.range.start.character }));
}

describe("typing and deleting a `}` in a brace body", () => {
  it.each(EDITS)("$name", ({ after, stray }) => {
    const c = new SparkdownCompiler();
    c.configure({ files: [file(SOURCE, 1)] } as any);
    c.compile({ textDocument: { uri: URI } });

    const offset = SOURCE.indexOf(after) + after.length;
    expect(offset).toBeGreaterThan(after.length - 1);
    const typed = SOURCE.slice(0, offset) + "}" + SOURCE.slice(offset);

    // Type the `}`.
    const at = posAt(SOURCE, offset);
    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: "}" }],
    });
    const afterTyping = pick(c.compile({ textDocument: { uri: URI } }).program);
    const coldTyped = coldCompile(typed);
    expect(stable(afterTyping)).toBe(stable(coldTyped));
    // The stray `}` is reported where it stands, and nowhere else.
    expect(invalidSyntax(coldTyped)).toEqual([stray]);
    expect(invalidSyntax(coldCompile(SOURCE))).toEqual([]);

    // Delete it again.
    const end = { line: at.line, character: at.character + 1 };
    c.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ range: { start: at, end }, text: "" }],
    });
    const afterDeleting = pick(c.compile({ textDocument: { uri: URI } }).program);
    expect(stable(afterDeleting)).toBe(stable(coldCompile(SOURCE)));
  });
});
