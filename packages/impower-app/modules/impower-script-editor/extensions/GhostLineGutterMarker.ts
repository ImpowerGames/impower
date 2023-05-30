import { GutterMarker } from "@codemirror/view";

export class GhostLineGutterMarker extends GutterMarker {
  override elementClass = "cm-ghostGutterMark";

  override toDOM(): Node {
    const spanEl = document.createElement("span");
    spanEl.style.marginLeft = "3px";
    spanEl.style.marginRight = "-3px";
    spanEl.appendChild(document.createTextNode("-"));
    return spanEl;
  }
}
