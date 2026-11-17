import type { EditorView } from "@codemirror/view";
import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import TitlePageWidget from "../../src/modules/screenplay-preview/classes/widgets/TitlePageWidget";
import createEditorView from "../../src/modules/screenplay-preview/utils/createEditorView";
import { decorate } from "../../src/modules/screenplay-preview/utils/screenplayFormatting";
import { settleParse } from "../helpers/parseSettle";

let view: EditorView | undefined;

const render = (name: string, text: string, config: ScreenplayConfig, scenesBefore: number, width: number) => {
  const section = document.body.appendChild(document.createElement("section"));
  section.dataset["fixture"] = name;
  section.style.width = `${width}px`;
  view = createEditorView(section, {
    textDocument: { uri: "file:///main.sd", version: 1, text },
    config,
    scenesBefore,
  });
  settleParse(view);
};

const titlePageEstimate = () => {
  const ranges = view ? decorate(view.state) : [];
  const widget = ranges.map((range) => range.value.spec.widget).find((found) => found instanceof TitlePageWidget);
  return widget?.estimatedHeight;
};

Object.assign(window, { renderScreenplay: render, titlePageEstimate });
