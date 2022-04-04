import { GutterMarker } from "@codemirror/gutter";

export class RunningLineGutterMarker extends GutterMarker {
  elementClass = "cm-runningGutterMark";

  toDOM(): Node {
    const spanEl = document.createElement("span");
    spanEl.appendChild(document.createTextNode("▶"));
    return spanEl;
  }
}
