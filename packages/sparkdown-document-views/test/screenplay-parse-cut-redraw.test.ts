import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import createEditorView from "../src/modules/screenplay-preview/utils/createEditorView";
import { replaceWithParseCut, settleParse } from "./helpers/parseSettle";

const SOURCE = [
  "scene s",
  "  Before.",
  "  queue | Alpha. | Beta. end GUIDE: After them.",
  "  :",
  "    The door creaks.",
  "  queue | Alpha. | Beta. end : After them.",
  "  queue | Alpha. | Beta. end GUIDE: After them.",
  "  They see .. queue | a cat | a dog .. outside.",
  "  queue | Alpha. | Beta. end GUIDE: After them.",
  "  After.",
  "end",
  "",
].join("\n");

const PREVIOUS = ["scene s", "  ((play music))", "end", ""].join("\n");

const CONFIGS: Record<string, ScreenplayConfig> = {
  default: { screenplay_print_title_page: false },
  "scene identifiers": { screenplay_print_title_page: false, screenplay_print_scene_identifiers: true },
};

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
});

const open = (text: string, config: ScreenplayConfig) => {
  const parent = document.body.appendChild(document.createElement("div"));
  parent.style.width = "800px";
  const view = createEditorView(parent, {
    textDocument: { uri: "file:///main.sd", version: 1, text },
    config,
  });
  views.push(view);
  settleParse(view);
  return view;
};

const rows = (view: EditorView) => Array.from(view.contentDOM.children, (row) => row.textContent ?? "");

describe("a screenplay page whose parse is cut short at an edit and finished later", () => {
  it.each(Object.keys(CONFIGS))("draws the same rows as a page drawn from the finished parse, with %s settings", (name) => {
    const config = CONFIGS[name]!;
    const expected = rows(open(SOURCE, config));
    expect(expected.join("|")).toContain("GUIDEAfter them.");
    const cutsInsideBlockLines = new Set<number>();
    const differences: string[] = [];
    for (let clockReads = 0; clockReads <= 30; clockReads++) {
      const view = open(PREVIOUS, config);
      const cut = replaceWithParseCut(view, SOURCE, clockReads);
      settleParse(view);
      const line = view.state.doc.lineAt(cut);
      if (cut > line.from && cut < line.to && / end \S/.test(line.text)) cutsInsideBlockLines.add(line.number);
      const drawn = rows(view);
      if (drawn.join("\n") !== expected.join("\n")) {
        differences.push(`parse cut at ${cut} (line ${line.number}): ${JSON.stringify(drawn)}`);
      }
    }
    expect(cutsInsideBlockLines.size).toBeGreaterThan(0);
    expect(differences).toEqual([]);
  });
});
