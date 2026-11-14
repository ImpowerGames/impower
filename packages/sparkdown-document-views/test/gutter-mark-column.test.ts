import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  breakpoints,
  getBreakpointLineNumbers,
  setBreakpointStates,
} from "../src/cm-breakpoints/breakpoints";
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

const SCRIPT = [
  "scene interrogation",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "end",
].join("\n");

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const choice = (line: number): ChoiceMarker => ({
  line,
  icon: "auto",
  title: `Choice · line ${line}`,
  text: "The preview chose this option.",
  options: [
    { text: "Tell the truth.", taken: true, pinned: false },
    { text: "Lie.", taken: false, pinned: false },
  ],
  unpin: false,
});

const mount = (onAction?: (line: number, action: ChoiceMarkerAction) => void) => {
  view = new EditorView({
    state: EditorState.create({
      doc: SCRIPT,
      extensions: [
        breakpoints(),
        choiceMarkers(),
        onAction ? choiceMarkerActions.of(onAction) : [],
      ],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  setChoiceMarkers(view, [choice(3), choice(5)]);
  setBreakpointStates(view, [{ line: 3, verified: true }]);
  return view;
};

const drawnChoices = (v: EditorView) =>
  [...v.dom.querySelectorAll<HTMLElement>(".cm-choice-marker")].map(
    (marker) => marker.dataset["line"],
  );

const breakpointButtons = (v: EditorView) => [
  ...v.dom.querySelectorAll<HTMLElement>(".cm-breakpoint-gutter .cm-breakpoint"),
];

describe("the gutter's mark column", () => {
  it("draws one mark on a line with a breakpoint and a choice, the breakpoint, and a press on it clears the breakpoint", async () => {
    const v = mount();
    await nextFrame();
    expect(drawnChoices(v)).toEqual(["5"]);
    expect(breakpointButtons(v).map((b) => b.getAttribute("aria-label"))).toEqual(["Remove breakpoint"]);
    vi.spyOn(v, "lineBlockAtHeight").mockReturnValue(v.lineBlockAt(v.state.doc.line(3).from));
    breakpointButtons(v)[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(getBreakpointLineNumbers(v)).toEqual([]);
  });

  it("draws the choice marker again when the breakpoint on its line is cleared", async () => {
    const v = mount();
    await nextFrame();
    expect(drawnChoices(v)).toEqual(["5"]);
    setBreakpointStates(v, []);
    await nextFrame();
    expect(drawnChoices(v)).toEqual(["3", "5"]);
  });

  it("keeps the hidden choice's marker data, popover and pin action, so only its gutter mark gives way", async () => {
    const actions: [number, ChoiceMarkerAction][] = [];
    const v = mount((line, action) => actions.push([line, action]));
    await nextFrame();
    expect(getChoiceMarkers(v.state)).toEqual([
      { line: 3, icon: "auto" },
      { line: 5, icon: "auto" },
    ]);
    openChoicePopover(v, 3);
    await nextFrame();
    expect(openChoiceLine(v.state)).toBe(3);
    const pin = document.querySelector<HTMLButtonElement>(".cm-choice-popover .cm-choice-popover-pin")!;
    pin.click();
    expect(actions).toEqual([[3, { kind: "pin", option: 0 }]]);
  });
});
