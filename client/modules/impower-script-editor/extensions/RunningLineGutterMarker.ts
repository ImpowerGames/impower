import { GutterMarker } from "@codemirror/view";

export class RunningLineGutterMarker extends GutterMarker {
  override elementClass = "cm-runningGutterMark";

  override toDOM(): Node {
    const spanEl = document.createElement("span");
    spanEl.appendChild(document.createTextNode("▶"));
    return spanEl;
  }
}
