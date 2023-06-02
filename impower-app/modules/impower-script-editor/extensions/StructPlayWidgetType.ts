import { WidgetType } from "@codemirror/view";

const ICON_COLOR = "#2B83B7";
const DEFAULT_COLOR = "#00000000";
const HOVER_COLOR = "#00000040";
const TAP_COLOR = "#000000";

const PlayButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.0.0-beta1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) --><path d="M176 480C148.6 480 128 457.6 128 432v-352c0-25.38 20.4-47.98 48.01-47.98c8.686 0 17.35 2.352 25.02 7.031l288 176C503.3 223.8 512 239.3 512 256s-8.703 32.23-22.97 40.95l-288 176C193.4 477.6 184.7 480 176 480z"/></svg>`;

export class StructPlayWidgetType extends WidgetType {
  id: string;

  onClick: (button: HTMLElement) => void;

  constructor(id: string, onClick: (button: HTMLElement) => void) {
    super();
    this.id = id;
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
    button.className = "cm-struct-play-autofill";
    button.innerHTML = PlayButtonIcon;
    button.style.color = ICON_COLOR;
    button.style.fill = "currentColor";
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
    button.onclick = (): void => {
      this.onClick?.(button);
    };
    return root;
  }

  override eq(other: StructPlayWidgetType): boolean {
    return this.id === other.id;
  }
}
