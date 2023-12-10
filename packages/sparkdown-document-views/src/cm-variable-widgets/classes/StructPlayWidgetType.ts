import { WidgetType } from "@codemirror/view";

const ICON_COLOR = "#2B83B7";
const DEFAULT_COLOR = "#00000000";
const HOVER_COLOR = "#00000040";
const TAP_COLOR = "#000000";

export const STRUCT_PLAY_BUTTON_CLASS_NAME = "cm-struct-play-button";

export default class StructPlayWidgetType extends WidgetType {
  id: string;

  icon: string;

  onClick: (e: MouseEvent) => void;

  constructor(id: string, icon: string, onClick: (e: MouseEvent) => void) {
    super();
    this.id = id;
    this.icon = icon;
    this.onClick = onClick;
  }

  toDOM(): HTMLElement {
    const root = document.createElement("span");
    root.className = "cm-struct-play";
    root.style.position = "relative";
    root.style.marginLeft = "8px";
    root.style.color = "white";
    root.style.float = "right";

    const button = document.createElement("button");
    button.classList.add(STRUCT_PLAY_BUTTON_CLASS_NAME);
    button.classList.add(this.id.replaceAll(".", "-"));
    button.innerHTML = this.icon;
    button.style.color = ICON_COLOR;
    button.style.width = "1.25rem";
    button.style.height = "1.25rem";
    button.style.display = "flex";
    button.style.justifyContent = "center";
    button.style.alignItems = "center";
    button.style.backgroundColor = "transparent";
    button.style.margin = "0";
    button.style.padding = "4px";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";

    root.appendChild(button);

    button.onmouseenter = (): void => {
      button.style.backgroundColor = HOVER_COLOR;
    };
    button.onmouseleave = (): void => {
      button.style.backgroundColor = DEFAULT_COLOR;
    };
    button.onpointerup = (): void => {
      button.style.backgroundColor = HOVER_COLOR;
    };
    button.onpointerdown = (e: MouseEvent): void => {
      e.stopImmediatePropagation();
      e.preventDefault();
      button.style.backgroundColor = TAP_COLOR;
    };
    button.onclick = (e): void => {
      this.onClick?.(e);
    };
    return root;
  }

  override eq(other: StructPlayWidgetType): boolean {
    return this.id === other.id && this.icon === other.icon;
  }
}
