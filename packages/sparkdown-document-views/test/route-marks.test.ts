import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  choiceMarkerActions,
  choiceMarkers,
  getChoiceMarkers,
  openChoiceLine,
  openChoicePopover,
  setChoiceMarkers,
  type ChoiceMarker,
  type ChoiceMarkerAction,
} from "../src/cm-choice-markers/choiceMarkers";
import {
  highlightLines,
  setHighlights,
} from "../src/cm-highlight-lines/highlightLines";
import {
  FORCED_ROUTE_CLASS_NAME,
  getRouteRuleSegments,
  lineBands,
  ROUTE_CLASS_NAME,
  setForcedLines,
} from "../src/cm-line-bands/lineBands";
import { isExecutionGap } from "../src/modules/script-editor/constants/EDITOR_EXTENSIONS";

const SCRIPT = [
  "scene interrogation",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "  if trust > 3 then",
  "    I believe you.",
  "    You found {clues} clues.",
  "  end",
  "end",
].join("\n");

let view: EditorView | undefined;

const mount = (onAction?: (line: number, action: ChoiceMarkerAction) => void) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: SCRIPT,
      extensions: [
        highlightLines({ isGap: isExecutionGap }),
        lineBands(),
        choiceMarkers(),
        onAction ? choiceMarkerActions.of(onAction) : [],
      ],
    }),
    parent,
  });
  return view;
};

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const insertAbove = (line: number, text: string) => {
  const at = view!.state.doc.line(line).from;
  view!.dispatch({ changes: { from: at, insert: text } });
};

const choice = (line: number, icon: ChoiceMarker["icon"]): ChoiceMarker => ({
  line,
  icon,
  title: `Choice · line ${line}`,
  text:
    icon === "pinned"
      ? "The preview takes your pinned option here."
      : "No pin. The preview chose this option to reach line 10.",
  options: [
    { text: "Tell the truth.", taken: line === 3, pinned: icon === "pinned" },
    { text: "Lie.", taken: line === 5, pinned: false },
  ],
  unpin: icon === "pinned",
});

describe("the route rule's gaps and dashes", () => {
  it("leaves a gap at lines the route did not run", () => {
    mount();
    setHighlights(view!, [1, 2, 3, 4, 7, 8, 9, 10]);
    expect(getRouteRuleSegments(view!.state)).toEqual([
      { first: 1, last: 4, forced: false },
      { first: 7, last: 10, forced: false },
    ]);
  });

  it("dashes the lines it is given as forced, and only where the rule runs", async () => {
    mount();
    setHighlights(view!, [1, 2, 3, 4, 7, 8, 9, 10]);
    setForcedLines(view!, [9, 10, 11]);
    expect(getRouteRuleSegments(view!.state)).toEqual([
      { first: 1, last: 4, forced: false },
      { first: 7, last: 8, forced: false },
      { first: 9, last: 10, forced: true },
    ]);
    await nextFrame();
    const rules = [
      ...view!.dom.querySelectorAll<HTMLElement>(`.cm-line-bands .${ROUTE_CLASS_NAME}`),
    ];
    expect(rules.map((rule) => rule.classList.contains(FORCED_ROUTE_CLASS_NAME))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("dashes a speaker cue with the forced dialogue under it", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    view = new EditorView({
      state: EditorState.create({
        doc: ["  if trust > 3 then", "    INSPECTOR:", "      I believe you.", "  end"].join("\n"),
        extensions: [highlightLines({ isGap: isExecutionGap }), lineBands()],
      }),
      parent,
    });
    setHighlights(view, [1, 3]);
    setForcedLines(view, [3]);
    expect(getRouteRuleSegments(view.state)).toEqual([
      { first: 1, last: 1, forced: false },
      { first: 2, last: 3, forced: true },
    ]);
  });

  it("keeps the dashes on their lines through an edit above them", () => {
    mount();
    setHighlights(view!, [8, 9, 10]);
    setForcedLines(view!, [9, 10]);
    insertAbove(2, "  Wait.\n");
    expect(getRouteRuleSegments(view!.state)).toEqual([
      { first: 9, last: 9, forced: false },
      { first: 10, last: 11, forced: true },
    ]);
  });

  it("clears the dashes when it is given no forced lines", () => {
    mount();
    setHighlights(view!, [8, 9, 10]);
    setForcedLines(view!, [9, 10]);
    setForcedLines(view!, []);
    expect(getRouteRuleSegments(view!.state)).toEqual([
      { first: 8, last: 10, forced: false },
    ]);
  });
});

describe("choice markers", () => {
  it("draw a pin or an options mark at each line they are given", async () => {
    mount();
    setChoiceMarkers(view!, [choice(3, "pinned"), choice(5, "auto")]);
    expect(getChoiceMarkers(view!.state)).toEqual([
      { line: 3, icon: "pinned" },
      { line: 5, icon: "auto" },
    ]);
    await nextFrame();
    const marks = [...view!.dom.querySelectorAll<HTMLElement>(".cm-choice-marker")];
    expect(marks.map((mark) => [mark.dataset["line"], mark.dataset["icon"]])).toEqual([
      ["3", "pinned"],
      ["5", "auto"],
    ]);
  });

  it("are buttons assistive technology can reach, with their labels", async () => {
    mount();
    setChoiceMarkers(view!, [choice(3, "pinned")]);
    await nextFrame();
    const mark = view!.dom.querySelector<HTMLButtonElement>(".cm-choice-marker")!;
    expect(mark.tagName).toBe("BUTTON");
    expect(mark.getAttribute("aria-label")).toBe("Pinned choice on line 3");
    expect(mark.closest("[aria-hidden=true]")).toBeNull();
  });

  it("move with their lines through edits and go with a deleted line", () => {
    mount();
    setChoiceMarkers(view!, [choice(3, "pinned"), choice(5, "auto")]);
    insertAbove(2, "  choose\n    * [Wait.]\n  end\n");
    expect(getChoiceMarkers(view!.state)).toEqual([
      { line: 6, icon: "pinned" },
      { line: 8, icon: "auto" },
    ]);
    const line = view!.state.doc.line(8);
    view!.dispatch({ changes: { from: line.from, to: line.to + 1 } });
    expect(getChoiceMarkers(view!.state)).toEqual([{ line: 6, icon: "pinned" }]);
  });

  it("are cleared when they are given none", () => {
    mount();
    setChoiceMarkers(view!, [choice(3, "pinned")]);
    setChoiceMarkers(view!, []);
    expect(getChoiceMarkers(view!.state)).toEqual([]);
  });
});

describe("the choice popover", () => {
  it("opens under the marker's line on a press, with the options and the pin control", async () => {
    mount();
    setChoiceMarkers(view!, [choice(3, "pinned")]);
    await nextFrame();
    view!.dom.querySelector<HTMLElement>(".cm-choice-marker")!.click();
    expect(openChoiceLine(view!.state)).toBe(3);
    await nextFrame();
    const popover = view!.dom.querySelector<HTMLElement>(".cm-choice-popover");
    expect(popover?.classList.contains("cm-tooltip")).toBe(true);
    expect(popover!.querySelector(".cm-choice-popover-title")!.textContent).toBe(
      "Choice · line 3",
    );
    expect(popover!.querySelector(".cm-choice-popover-text")!.textContent).toBe(
      "The preview takes your pinned option here.",
    );
    const rows = [...popover!.querySelectorAll<HTMLElement>(".cm-choice-popover-option")];
    expect(
      rows.map((row) => [
        row.querySelector(".cm-choice-popover-option-text")!.textContent,
        row.hasAttribute("data-taken"),
        row.querySelector("button")!.textContent,
        row.querySelector("button")!.getAttribute("aria-pressed"),
      ]),
    ).toEqual([
      ["Tell the truth.", true, "Pinned", "true"],
      ["Lie.", false, "Pin", "false"],
    ]);
    expect(
      [...popover!.querySelectorAll(".cm-choice-popover-action")].map((b) => b.textContent),
    ).toEqual(["Unpin", "Whole route"]);
  });

  it("sends the line and the action of each control to its handler", async () => {
    const onAction = vi.fn();
    mount(onAction);
    setChoiceMarkers(view!, [choice(3, "pinned")]);
    openChoicePopover(view!, 3);
    await nextFrame();
    const popover = view!.dom.querySelector<HTMLElement>(".cm-choice-popover")!;
    popover.querySelectorAll<HTMLButtonElement>(".cm-choice-popover-pin")[1]!.click();
    const [unpin, route] = popover.querySelectorAll<HTMLButtonElement>(
      ".cm-choice-popover-action",
    );
    unpin!.click();
    route!.click();
    expect(onAction.mock.calls).toEqual([
      [3, { kind: "pin", option: 1 }],
      [3, { kind: "unpin" }],
      [3, { kind: "route" }],
    ]);
    expect(openChoiceLine(view!.state)).toBeNull();
  });

  it("closes on Escape, on a second press and when its marker goes", async () => {
    mount();
    setChoiceMarkers(view!, [choice(3, "pinned"), choice(5, "auto")]);
    openChoicePopover(view!, 5);
    view!.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(openChoiceLine(view!.state)).toBeNull();
    await nextFrame();
    const mark = view!.dom.querySelector<HTMLElement>(".cm-choice-marker[data-line='5']")!;
    mark.click();
    expect(openChoiceLine(view!.state)).toBe(5);
    view!.dom.querySelector<HTMLElement>(".cm-choice-marker[data-line='5']")!.click();
    expect(openChoiceLine(view!.state)).toBeNull();
    openChoicePopover(view!, 5);
    setChoiceMarkers(view!, [choice(3, "pinned")]);
    expect(openChoiceLine(view!.state)).toBeNull();
  });

  it("says when a pin was not saved", async () => {
    mount();
    setChoiceMarkers(view!, [{ ...choice(3, "pinned"), note: "The pin was not saved." }]);
    openChoicePopover(view!, 3);
    await nextFrame();
    const note = view!.dom.querySelector<HTMLElement>(".cm-choice-popover-note");
    expect(note?.textContent).toBe("The pin was not saved.");
    expect(note?.getAttribute("role")).toBe("status");
  });

  it("opens from its marker by keyboard and closes on Escape with focus still on the marker", async () => {
    mount();
    setChoiceMarkers(view!, [choice(3, "pinned")]);
    await nextFrame();
    const mark = view!.dom.querySelector<HTMLButtonElement>(".cm-choice-marker")!;
    mark.focus();
    expect(document.activeElement).toBe(mark);
    mark.click();
    expect(openChoiceLine(view!.state)).toBe(3);
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    mark.dispatchEvent(escape);
    expect(openChoiceLine(view!.state)).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
  });

  it("follows its line through an edit above it", () => {
    mount();
    setChoiceMarkers(view!, [choice(5, "auto")]);
    openChoicePopover(view!, 5);
    insertAbove(1, "// note\n");
    expect(openChoiceLine(view!.state)).toBe(6);
  });
});
