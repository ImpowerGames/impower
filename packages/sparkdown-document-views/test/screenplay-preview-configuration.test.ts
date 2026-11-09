import { EditorView } from "@codemirror/view";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenplayPreviewController } from "../src/modules/screenplay-preview/ScreenplayPreviewController";
import { settleParse } from "./helpers/parseSettle";

const TEXT = ["scene Opening", "", "  $: INT. CASINO - NIGHT", "", "  Bunny enters.", ""].join("\n");

const controllers: ScreenplayPreviewController[] = [];

const setUp = () => {
  const host = document.body.appendChild(document.createElement("div"));
  const preview = host.appendChild(document.createElement("div"));
  const loading = host.appendChild(document.createElement("div"));
  const controller = new ScreenplayPreviewController(host, { preview, loading });
  controllers.push(controller);
  controller.setup();
  return { controller, preview };
};

const load = ({ preview }: ReturnType<typeof setUp>) => {
  sendProtocolMessage(
    LoadPreviewMessage.type.request({
      type: "screenplay",
      textDocument: { uri: "file:///main.sd", languageId: "sparkdown", version: 1, text: TEXT },
    }),
  );
  const view = EditorView.findFromDOM(preview.querySelector<HTMLElement>(".cm-editor")!)!;
  settleParse(view);
  return view;
};

const configure = (settings: Record<string, unknown>) =>
  sendProtocolMessage(DidChangeConfigurationMessage.type.notification({ settings }));

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.dispose();
  }
  document.body.replaceChildren();
});

describe("screenplay preview configuration message", () => {
  it("applies a print setting to a rendered preview", () => {
    const view = load(setUp());
    configure({ screenplay_print_headings_bold: true });
    expect(view.dom.dataset["headingsBold"]).toBe("on");
    configure({ screenplay_print_headings_bold: false });
    expect(view.dom.dataset["headingsBold"]).toBe("off");
  });

  it("keeps earlier print settings when a later message names only some", () => {
    const view = load(setUp());
    configure({ screenplay_print_headings_bold: true });
    configure({ screenplay_print_scene_numbers: "left" });
    expect(view.dom.dataset["headingsBold"]).toBe("on");
    expect(view.dom.dataset["sceneNumbers"]).toBe("left");
  });

  it("changes nothing for an unrelated setting", () => {
    const parts = setUp();
    const view = load(parts);
    configure({ screenplay_print_headings_bold: true });
    const dispatched = vi.spyOn(view, "dispatch");
    configure({ editor_newline_helper: true, screenplay_preview_synchronized_with_cursor: false });
    expect(dispatched).not.toHaveBeenCalled();
    expect(parts.controller["options"].config).toEqual({ screenplay_print_headings_bold: true });
    expect(view.dom.dataset["headingsBold"]).toBe("on");
  });

  it("does not repaint when the print settings are already applied", () => {
    const view = load(setUp());
    configure({ screenplay_print_headings_bold: true });
    const dispatched = vi.spyOn(view, "dispatch");
    configure({ screenplay_print_headings_bold: true });
    expect(dispatched).not.toHaveBeenCalled();
  });

  it("applies a configuration that arrives before the first render", () => {
    const parts = setUp();
    configure({ screenplay_print_headings_bold: true });
    expect(load(parts).dom.dataset["headingsBold"]).toBe("on");
  });
});
