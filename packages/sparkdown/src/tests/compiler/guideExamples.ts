import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The Sparkle guide's fenced `sparkdown` examples, read by the tests that keep
// the guide compiling and formatted (#1232).

const __dirname = dirname(fileURLToPath(import.meta.url));

export const GUIDE_DIR = join(__dirname, "../../../docs/guide");

/** The chapters #1232 rewrote for brace bodies and dotted classes. */
export const BRACE_CHAPTERS = [
  "Introduction.md",
  "Structure.md",
  "ControlFlow.md",
  "Components.md",
  "Widgets.md",
  "Screens.md",
  "StyleProps.md",
  "AnimationTheme.md",
  "Loading.md",
];

export interface GuideExample {
  chapter: string;
  /** 1-based line of the fence's first code line in the chapter. */
  line: number;
  /** The code, with the indentation every line shares removed. */
  code: string;
}

export function guideChapters(): string[] {
  return readdirSync(GUIDE_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

/** Every fenced `sparkdown` example of a chapter. A fence may be indented
 *  (inside a list item); its shared indentation is removed. */
export function guideExamples(chapter: string): GuideExample[] {
  const lines = readFileSync(join(GUIDE_DIR, chapter), "utf8").split(/\r?\n/);
  const examples: GuideExample[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```sparkdown\s*$/.exec(lines[i]!);
    if (!open) continue;
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j]!)) {
      body.push(lines[j]!);
      j++;
    }
    const indent = Math.min(
      ...body
        .filter((l) => l.trim() !== "")
        .map((l) => /^ */.exec(l)![0].length),
    );
    const shared = Number.isFinite(indent) ? indent : 0;
    examples.push({
      chapter,
      line: i + 2,
      code: body.map((l) => l.slice(shared)).join("\n") + "\n",
    });
    i = j;
  }
  return examples;
}

const TOP_LEVEL =
  /^(layout|component|style|animation|theme|screen|store|scene|function|define|morph)\b/m;

/** Whether an example is a fragment of a layout body (`button "Save"`), as
 *  opposed to a whole script, a story fragment (`[[open hud]]`) or front
 *  matter. */
export function isLayoutFragment(code: string): boolean {
  if (TOP_LEVEL.test(code)) return false;
  return !/^(\[\[|->|<-|---)/m.test(code);
}

// A fragment goes inside a block, where every line is read as a brace entry,
// which is how a whole body reads once the indented form is gone (#1234).
const WRAP_OPEN = "layout guide_example with\n  box {\n";
const WRAP_CLOSE = "  }\nend\n";
const WRAP_INDENT = "    ";

/** A layout body fragment inside a block of a layout, so it is read,
 *  compiled and formatted as the entries of a block are. */
export function wrapFragment(code: string): string {
  const body = code
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => (l === "" ? l : `${WRAP_INDENT}${l}`))
    .join("\n");
  return `${WRAP_OPEN}${body}\n${WRAP_CLOSE}`;
}

/** The fragment back out of `wrapFragment`'s layout, or undefined when the
 *  lines around it are not where `wrapFragment` put them. */
export function unwrapFragment(wrapped: string): string | undefined {
  if (!wrapped.startsWith(WRAP_OPEN) || !wrapped.endsWith(`\n${WRAP_CLOSE}`)) {
    return undefined;
  }
  return (
    wrapped
      .slice(WRAP_OPEN.length, -WRAP_CLOSE.length - 1)
      .split("\n")
      .map((l) => (l.startsWith(WRAP_INDENT) ? l.slice(WRAP_INDENT.length) : l))
      .join("\n") + "\n"
  );
}

/** The example as a script: a layout body fragment inside a layout, anything
 *  else as written. */
export function asScript(code: string): string {
  return isLayoutFragment(code) ? wrapFragment(code) : code;
}
