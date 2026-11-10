import { EditorState } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { touchAffordances } from "../src/modules/script-editor/utils/extensions/touchAffordances";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

type Config = { coarsePointer: boolean; onViewUpdate: (u: ViewUpdate) => void };

const created: EditorView[] = [];

vi.mock("../src/modules/script-editor/utils/createEditorView", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  default: (parent: HTMLElement, config: Config) => {
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"),
        extensions: [
          touchAffordances(config.coarsePointer),
          EditorView.updateListener.of(config.onViewUpdate),
        ],
      }),
    });
    created.push(view);
    return [view, { dispose() {} }];
  },
}));

const { ScriptEditorController } = await import(
  "../src/modules/script-editor/ScriptEditorController"
);

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  created.splice(0);
  vi.restoreAllMocks();
});

const touch = (view: EditorView, type: string, y: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const points = type === "touchcancel" ? [] : [{ clientX: 20, clientY: y }];
  Object.defineProperty(event, "touches", { value: points });
  Object.defineProperty(event, "targetTouches", { value: points });
  Object.defineProperty(event, "changedTouches", { value: points });
  view.contentDOM.dispatchEvent(event);
};

const swipe = (view: EditorView) => {
  touch(view, "touchstart", 120);
  touch(view, "touchmove", 20);
  expect(view.scrollDOM.scrollTop).toBe(100);
};

const mount = async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const host = document.body.appendChild(document.createElement("div"));
  const controller = new ScriptEditorController(
    host,
    {
      editor: host.appendChild(document.createElement("div")),
      loading: host.appendChild(document.createElement("div")),
      main: host.appendChild(document.createElement("div")),
      placeholder: host.appendChild(document.createElement("div")),
    },
    {
      coarsePointer: true,
      appearance: ALL_ON_APPEARANCE,
      languageServerWorker: {} as Worker,
      languageServerConnection: {} as never,
    },
  );
  controller.setup();
  await controller["handleLoadEditor"]({
    ...LoadEditorMessage.type.request({
      textDocument: { uri: "file:///main.sd", languageId: "sparkdown", version: 0, text: "" },
      selectedRange: { start: { line: 40, character: 0 }, end: { line: 40, character: 0 } },
      visibleRange: "center",
      languageServerInitializeParams: {} as never,
      languageServerInitializeResult: {} as never,
    }),
    id: "touch-load",
  });
  const view = created.at(-1)!;
  vi.spyOn(view, "posAtCoords").mockReturnValue(0);
  cleanups.push(() => {
    touch(view, "touchcancel", 0);
    controller.dispose();
    host.remove();
  });
  return { controller, view };
};

describe("ScriptEditorController touch scrolling during a load", () => {
  it("keeps a swipe the author made before the editor settled", async () => {
    const { controller, view } = await mount();
    swipe(view);
    const scrolling = vi.spyOn(EditorView, "scrollIntoView");
    controller["handleIdle"]();
    expect(scrolling).not.toHaveBeenCalled();
  });

  it("stops the caret retry once the author swipes", async () => {
    const { controller, view } = await mount();
    const scrolling = vi.spyOn(EditorView, "scrollIntoView");
    controller["handleIdle"]();
    await vi.waitFor(() => expect(scrolling.mock.calls.length).toBeGreaterThan(1), {
      timeout: 5_000,
      interval: 20,
    });
    swipe(view);
    scrolling.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(scrolling).not.toHaveBeenCalled();
  });

  it("keeps retrying the caret while the author has not swiped", async () => {
    const { controller } = await mount();
    const scrolling = vi.spyOn(EditorView, "scrollIntoView");
    controller["handleIdle"]();
    await vi.waitFor(() => expect(scrolling.mock.calls.length).toBeGreaterThan(2), {
      timeout: 5_000,
      interval: 20,
    });
  });
});
