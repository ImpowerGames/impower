import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import createEditorView from "../src/modules/screenplay-preview/utils/createEditorView";
import {
  setScreenplayConfig,
  setScreenplayExecutedLines,
} from "../src/modules/screenplay-preview/utils/screenplaySettings";
import { settleParse } from "./helpers/parseSettle";

const FIXTURE = [
  "---",
  "title: The Heist",
  "author: Ann Writer",
  "---",
  "",
  "scene Opening",
  "",
  "  $: INT. CASINO - NIGHT",
  "",
  "  Bunny enters.",
  "",
  "  $: EXT. STREET - DAY",
  "",
  "  choose",
  "    + [Run]",
  "      Bunny runs.",
  "    + [Hide]",
  "      Bunny hides.",
  "  end",
  "",
  "branch Escape",
  "",
  "  Bunny escapes.",
  "",
].join("\n");

const views: EditorView[] = [];

const render = (settings?: ScreenplayConfig) => {
  const config = { screenplay_print_title_page: false, ...settings };
  const parent = document.body.appendChild(document.createElement("div"));
  parent.style.width = "800px";
  const view = createEditorView(parent, {
    textDocument: { uri: "file:///main.sd", version: 1, text: FIXTURE },
    config,
  });
  settleParse(view);
  views.push(view);
  return view;
};

const headings = (view: EditorView) =>
  Array.from(view.dom.querySelectorAll<HTMLElement>(".sp-heading"));

const lineIndexOf = (text: string) =>
  FIXTURE.split("\n").findIndex((line) => line.includes(text));

afterEach(() => {
  for (const view of views.splice(0)) {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
});

describe("screenplay preview follows the print settings", () => {
  it.each(["left", "right", "both", "none"] as const)(
    "puts scene numbers in the %s margin and numbers headings in order",
    (side) => {
      const view = render({ screenplay_print_scene_numbers: side });
      expect(view.dom.dataset["sceneNumbers"]).toBe(side);
      const found = headings(view);
      expect(found.map((h) => h.textContent?.trim())).toEqual([
        "INT. CASINO - NIGHT",
        "EXT. STREET - DAY",
      ]);
      expect(found.map((h) => h.dataset["sceneNumber"])).toEqual(["1", "2"]);
    },
  );

  it("prints headings bold only when the setting is on", () => {
    expect(render({ screenplay_print_headings_bold: true }).dom.dataset["headingsBold"]).toBe("on");
    expect(render({ screenplay_print_headings_bold: false }).dom.dataset["headingsBold"]).toBe("off");
  });

  it("lays the page out at the paper size's proportions", () => {
    const letter = render({ screenplay_print_paper_size: "usletter" }).dom;
    const a4 = render({ screenplay_print_paper_size: "a4" }).dom;
    expect(letter.dataset["paperSize"]).toBe("usletter");
    expect(a4.dataset["paperSize"]).toBe("a4");
    expect(letter.style.getPropertyValue("--sp-text-width")).toBe("36em");
    expect(a4.style.getPropertyValue("--sp-text-width")).toBe("34.62em");
    expect(letter.style.getPropertyValue("--sp-margin-left")).toBe("9em");
    expect(letter.style.getPropertyValue("--sp-margin-right")).toBe("6em");
  });

  it("shows the title page only when it prints", () => {
    const shown = render({ screenplay_print_title_page: true });
    expect(shown.contentDOM.textContent).toContain("The Heist");
    const hidden = render({ screenplay_print_title_page: false });
    expect(hidden.contentDOM.textContent).not.toContain("The Heist");
  });

  it("prints scene and branch names as headings only when they print", () => {
    const names = (view: EditorView) =>
      Array.from(view.dom.querySelectorAll(".sp-name")).map((n) => n.textContent);
    expect(names(render({}))).toEqual([]);
    expect(names(render({ screenplay_print_scene_identifiers: true }))).toEqual(["Opening"]);
    expect(names(render({ screenplay_print_branch_identifiers: true }))).toEqual(["Escape"]);
  });

  it("applies a settings change to a page already on screen", () => {
    const view = render({ screenplay_print_scene_numbers: "none" });
    view.dispatch({ effects: setScreenplayConfig.of({ screenplay_print_scene_numbers: "both", screenplay_print_paper_size: "a4" }) });
    expect(view.dom.dataset["sceneNumbers"]).toBe("both");
    expect(view.dom.dataset["paperSize"]).toBe("a4");
  });

  it("marks the chosen option among a choice's options", () => {
    const view = render({});
    const options = () => Array.from(view.dom.querySelectorAll<HTMLElement>(".sp-option"));
    expect(options().map((o) => o.textContent?.replace(/[+[\]\s]/g, ""))).toEqual(["Run", "Hide"]);
    expect(options().some((o) => o.classList.contains("sp-chosen"))).toBe(false);
    const chosen = () => options().map((o) => o.classList.contains("sp-chosen"));
    view.dispatch({ effects: setScreenplayExecutedLines.of([lineIndexOf("+ [Run]"), lineIndexOf("+ [Hide]")]) });
    expect(chosen()).toEqual([false, false]);
    view.dispatch({
      effects: setScreenplayExecutedLines.of([lineIndexOf("+ [Run]"), lineIndexOf("+ [Hide]"), lineIndexOf("Bunny hides.")]),
    });
    expect(chosen()).toEqual([false, true]);
    view.dispatch({ effects: setScreenplayExecutedLines.of([lineIndexOf("+ [Run]"), lineIndexOf("Bunny runs.")]) });
    expect(chosen()).toEqual([true, false]);
  });
});
