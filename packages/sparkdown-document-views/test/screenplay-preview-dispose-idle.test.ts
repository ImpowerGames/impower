import { EditorView } from "@codemirror/view";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenplayPreviewController } from "../src/modules/screenplay-preview/ScreenplayPreviewController";
import { settleParse } from "./helpers/parseSettle";

const TEXT = [
  "scene Opening",
  "",
  "  $: INT. CASINO - NIGHT",
  "",
  "  Bunny enters.",
  "",
].join(String.fromCharCode(10));

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("screenplay preview dispose", () => {
  it("does not rebind its view after disposal when onIdle was pending", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = document.body.appendChild(document.createElement("div"));
    const preview = host.appendChild(document.createElement("div"));
    const loading = host.appendChild(document.createElement("div"));
    const controller = new ScreenplayPreviewController(host, {
      preview,
      loading,
    });
    controller.setup();
    sendProtocolMessage(
      LoadPreviewMessage.type.request({
        type: "screenplay",
        textDocument: {
          uri: "file:///main.sd",
          languageId: "sparkdown",
          version: 1,
          text: TEXT,
        },
      }),
    );
    const view = EditorView.findFromDOM(
      preview.querySelector<HTMLElement>(".cm-editor")!,
    )!;
    settleParse(view);
    const bindView = vi.spyOn(controller as any, "bindView");
    controller["onIdle"]();
    controller.dispose();
    bindView.mockClear();
    vi.advanceTimersByTime(100);
    expect(bindView).not.toHaveBeenCalled();
  });

  it("still rebinds its view on idle while alive", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = document.body.appendChild(document.createElement("div"));
    const preview = host.appendChild(document.createElement("div"));
    const loading = host.appendChild(document.createElement("div"));
    const controller = new ScreenplayPreviewController(host, {
      preview,
      loading,
    });
    controller.setup();
    sendProtocolMessage(
      LoadPreviewMessage.type.request({
        type: "screenplay",
        textDocument: {
          uri: "file:///main.sd",
          languageId: "sparkdown",
          version: 1,
          text: TEXT,
        },
      }),
    );
    const view = EditorView.findFromDOM(
      preview.querySelector<HTMLElement>(".cm-editor")!,
    )!;
    settleParse(view);
    const bindView = vi.spyOn(controller as any, "bindView");
    controller["onIdle"]();
    bindView.mockClear();
    vi.advanceTimersByTime(100);
    expect(bindView).toHaveBeenCalledWith(view);
    controller.dispose();
  });
});
