import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import createEditorView from "../src/modules/screenplay-preview/utils/createEditorView";
import {
  setScreenplayConfig,
  setScreenplayPicks,
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

const BODYLESS = [
  "scene start",
  "  choose",
  "    + [Run]",
  "    + [Hide]",
  "  end",
  "  After choice.",
  "end",
  "",
].join("\n");

const render = (settings?: ScreenplayConfig, text = FIXTURE) => {
  const config = { screenplay_print_title_page: false, ...settings };
  const parent = document.body.appendChild(document.createElement("div"));
  parent.style.width = "800px";
  const view = createEditorView(parent, {
    textDocument: { uri: "file:///main.sd", version: 1, text },
    config,
  });
  settleParse(view);
  views.push(view);
  return view;
};

const headings = (view: EditorView) =>
  Array.from(view.dom.querySelectorAll<HTMLElement>(".sp-heading"));

const effectiveWeight = (element: Element | null): string => {
  for (let node = element; node; node = node.parentElement) {
    const weight = getComputedStyle(node).fontWeight;
    if (weight) return weight;
  }
  return "normal";
};

const headingTextWeights = (view: EditorView) =>
  headings(view).flatMap((heading) => {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const weights: string[] = [];
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.trim()) {
        weights.push(effectiveWeight(walker.currentNode.parentElement));
      }
    }
    return weights;
  });

const marginNumbers = (heading: HTMLElement) => {
  const found: { margin: string; content: string; position: string }[] = [];
  for (const sheet of Array.from(heading.ownerDocument.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      for (const selector of rule.selectorText.split(",")) {
        const pseudo = selector.trim().match(/^(.*)::(before|after)$/);
        if (!pseudo || !heading.matches(pseudo[1]!)) continue;
        if (!rule.style.getPropertyValue("content")) continue;
        found.push({
          margin: rule.style.getPropertyValue("right") ? "left" : "right",
          content: rule.style.getPropertyValue("content"),
          position: rule.style.getPropertyValue("position"),
        });
      }
    }
  }
  return found.sort((a, b) => a.margin.localeCompare(b.margin));
};

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
      const margins = marginNumbers(found[0]!);
      expect(margins.map((m) => m.margin)).toEqual(
        { left: ["left"], right: ["right"], both: ["left", "right"], none: [] }[side],
      );
      for (const margin of margins) {
        expect(margin.content).toBe("attr(data-scene-number)");
        expect(margin.position).toBe("absolute");
      }
    },
  );

  it("prints headings bold only when the setting is on", () => {
    const bold = render({ screenplay_print_headings_bold: true });
    expect(bold.dom.dataset["headingsBold"]).toBe("on");
    expect(headings(bold).map((h) => getComputedStyle(h).fontWeight)).toEqual(["bold", "bold"]);
    const plain = render({ screenplay_print_headings_bold: false });
    expect(plain.dom.dataset["headingsBold"]).toBe("off");
    expect(headings(plain).map((h) => getComputedStyle(h).fontWeight)).not.toContain("bold");
  });

  it("weights the heading text by the setting", () => {
    expect(headingTextWeights(render({ screenplay_print_headings_bold: true }))).toEqual(["bold", "bold"]);
    expect(headingTextWeights(render({ screenplay_print_headings_bold: false }))).toEqual(["normal", "normal"]);
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
    view.dispatch({ effects: setScreenplayPicks.of([lineIndexOf("+ [Hide]")]) });
    expect(chosen()).toEqual([false, true]);
    view.dispatch({ effects: setScreenplayPicks.of([lineIndexOf("+ [Hide]"), lineIndexOf("+ [Run]")]) });
    expect(chosen()).toEqual([true, true]);
    view.dispatch({ effects: setScreenplayPicks.of([lineIndexOf("Bunny runs.")]) });
    expect(chosen()).toEqual([false, false]);
  });

  it.each([
    ["first", 2, [true, false]],
    ["second", 3, [false, true]],
  ] as const)("marks only the %s option of a bodyless choice when it is picked", (_which, line, expected) => {
    const view = render({}, BODYLESS);
    const chosen = () =>
      Array.from(view.dom.querySelectorAll<HTMLElement>(".sp-option")).map((o) => o.classList.contains("sp-chosen"));
    expect(chosen()).toEqual([false, false]);
    view.dispatch({ effects: setScreenplayPicks.of([line]) });
    expect(chosen()).toEqual(expected);
  });
});
