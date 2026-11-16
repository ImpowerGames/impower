import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import createEditorView from "../../src/modules/screenplay-preview/utils/createEditorView";
import { settleParse } from "../helpers/parseSettle";

const render = (name: string, text: string, config: ScreenplayConfig, scenesBefore: number, width: number) => {
  const section = document.body.appendChild(document.createElement("section"));
  section.dataset["fixture"] = name;
  section.style.width = `${width}px`;
  const view = createEditorView(section, {
    textDocument: { uri: "file:///main.sd", version: 1, text },
    config,
    scenesBefore,
  });
  settleParse(view);
};

(window as unknown as { renderScreenplay: typeof render }).renderScreenplay = render;
