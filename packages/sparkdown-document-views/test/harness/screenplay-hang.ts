import createEditorView from "../../src/modules/screenplay-preview/utils/createEditorView";
import { settleParse } from "../helpers/parseSettle";

const LONG = "The reader sees these words and keeps on reading them all the way to the far end of a long line that must wrap.";

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
