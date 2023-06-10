import { WidgetType } from "@codemirror/view";
import SPARKDOWN_COLORS from "../constants/SPARKDOWN_COLORS";

export class JumpWidgetType extends WidgetType {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  override eq(other: JumpWidgetType): boolean {
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
    wrap.style.color = SPARKDOWN_COLORS.sectionName;
    return wrap;
  }
}
