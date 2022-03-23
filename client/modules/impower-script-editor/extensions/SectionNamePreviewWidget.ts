import { WidgetType } from "@codemirror/view";
import { colors } from "../constants/colors";

export class SectionNamePreviewWidget extends WidgetType {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  eq(other: SectionNamePreviewWidget): boolean {
    return other.name === this.name;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.setAttribute("aria-hidden", "true");
    wrap.className = "cm-section-name-preview";
    const text = document.createTextNode(`(${this.name})`);
    wrap.appendChild(text);
    wrap.style.marginLeft = "8px";
    wrap.style.opacity = "0.5";
    wrap.style.color = colors.sectionName;
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
