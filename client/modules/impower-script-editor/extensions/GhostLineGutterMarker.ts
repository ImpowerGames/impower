import { GutterMarker } from "@codemirror/view";

export class GhostLineGutterMarker extends GutterMarker {
  elementClass = "cm-ghostGutterMark";

  toDOM(): Node {
    const spanEl = document.createElement("span");
    spanEl.style.marginLeft = "3px";
    spanEl.style.marginRight = "-3px";
    spanEl.appendChild(document.createTextNode("-"));
    return spanEl;
  }
}
