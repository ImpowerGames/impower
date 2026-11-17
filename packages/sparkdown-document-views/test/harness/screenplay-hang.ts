import createEditorView from "../../src/modules/screenplay-preview/utils/createEditorView";
import { settleParse } from "../helpers/parseSettle";

const LONG = "The reader sees these words and keeps on reading them all the way to the far edge of a long line that must wrap.";

const nested = (depth: number) => {
  const lines: string[] = [];
  for (let level = 0; level <= depth; level++) {
    const indent = "  ".repeat(level * 2 + 1);
    lines.push(`${indent}queue`, `${indent}  | Short ${level}.`, `${indent}  |${level === depth ? ` ${LONG}` : ""}`);
  }
  for (let level = depth; level >= 0; level--) lines.push(`${"  ".repeat(level * 2 + 1)}end`);
  return ["scene s", ...lines, "end", ""].join("\n");
};

const FIXTURES: Record<string, string> = {
  "depth 0": nested(0),
  "depth 1": nested(1),
  "depth 2": nested(2),
  "depth 7": nested(7),
  "depth 8": nested(8),
  "shared with text": ["scene s", `  queue | ${LONG} | Short. end : Afterwards.`, "end", ""].join("\n"),
  "unmarked text wrapping after a block": ["scene s", `  queue | One. | Two. end : ${LONG}`, "end", ""].join("\n"),
  "mixed depths on one line": ["scene s", "  if flag then", `    queue | ${LONG} | Short. end : Outer tail.`, "  end", "end", ""].join("\n"),
  "a block after a nested block": ["scene s", `  queue | queue | In A. | In B. end | Out. end queue | ${LONG} | Four. end`, "end", ""].join("\n"),
  "shared with a block": ["scene s", `  queue | One. | Two. end queue | ${LONG} | Short. end`, "end", ""].join("\n"),
  "two blocks with a blank between": ["scene s", "  Before.", "  queue | One A. | One B. end queue | Two A. | Two B. end", "  After.", "end", ""].join("\n"),
  "a function then a block": ["scene s", "  Before.", "  function f() end queue | One. | Two. end", "  After.", "end", ""].join("\n"),
  "a block then a function": ["scene s", "  Before.", "  queue | One. | Two. end function f() end", "  After.", "end", ""].join("\n"),
};

for (const [name, text] of Object.entries(FIXTURES)) {
  const section = document.body.appendChild(document.createElement("section"));
  section.dataset["fixture"] = name;
  const view = createEditorView(section, {
    textDocument: { uri: "file:///main.sd", version: 1, text },
    config: { screenplay_print_title_page: false },
  });
  settleParse(view);
}

(window as unknown as { screenplayHang: boolean }).screenplayHang = true;
