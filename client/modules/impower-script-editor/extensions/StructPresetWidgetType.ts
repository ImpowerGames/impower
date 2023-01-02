import { WidgetType } from "@codemirror/view";

const ICON_COLOR = "#2B83B7";
const DEFAULT_COLOR = "#00000000";
const HOVER_COLOR = "#00000040";
const TAP_COLOR = "#000000";

const ButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><!--! Font Awesome Pro 6.0.0-beta1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) --><path d="M192 320c0 17.67 14.33 32 32 32s32-14.33 32-32S241.7 288 224 288S192 302.3 192 320zM96 320c0 17.67 14.33 32 32 32s32-14.33 32-32S145.7 288 128 288S96 302.3 96 320zM639.1 69.79c0-11.26-4.295-22.52-12.89-31.11L601.3 12.89c-8.592-8.592-19.85-12.89-31.11-12.89S547.7 4.295 539.1 12.89L311.7 240.3c-3.072 3.072-5.164 6.984-6.016 11.24l-17.46 87.32c-.1486 .7434-.2188 1.471-.2188 2.191c0 6.012 4.924 10.94 10.94 10.94c.7197 0 1.449-.0707 2.192-.2194l87.33-17.46c4.258-.8516 8.168-2.945 11.24-6.016l227.4-227.4C635.7 92.31 639.1 81.05 639.1 69.79zM511.1 326.6C511.1 326.6 511.1 326.6 511.1 326.6L511.1 448H63.1V192h228.1l63.1-64H63.1C28.66 128 0 156.7 0 192v256c0 35.35 28.66 64 63.1 64h447.1c35.34 0 63.1-28.65 63.1-63.1L576 219.9l-64 63.99L511.1 326.6z"/></svg>`;

const CheckIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.0.0-beta1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) --><path d="M480 128c0 8.188-3.125 16.38-9.375 22.62l-256 256C208.4 412.9 200.2 416 192 416s-16.38-3.125-22.62-9.375l-128-128C35.13 272.4 32 264.2 32 256c0-18.28 14.95-32 32-32c8.188 0 16.38 3.125 22.62 9.375L192 338.8l233.4-233.4C431.6 99.13 439.8 96 448 96C465.1 96 480 109.7 480 128z"/></svg>`;

const STRUCT_PRESET_POPUP_CLASS_PREFIX = "cm-struct-preset-popup-";

const STRUCT_PRESET_PREVIEW_CLASS_PREFIX = "cm-struct-preset-preview-";

export const getPresetPopupClassName = (id: string): string => {
  return `${STRUCT_PRESET_POPUP_CLASS_PREFIX}${id}`;
};

export const getPresetPreviewClassName = (id: string): string => {
  return `${STRUCT_PRESET_PREVIEW_CLASS_PREFIX}${id}`;
};

interface Option {
  label?: string;
  innerHTML?: string;
  onClick: (e: PointerEvent, previewEl: HTMLElement) => void;
}

export class StructPresetWidgetType extends WidgetType {
  id: string;

  options?: Option[] = [];

  updatePreview: () => void;

  constructor(id: string, options: Option[], updatePreview: () => void) {
    super();
    this.id = id;
    this.options = options;
    this.updatePreview = updatePreview;
  }

  toDOM(): HTMLElement {
    const root = document.createElement("span");
    root.className = "cm-struct-preset";
    root.style.position = "relative";
    root.style.marginLeft = "8px";
    root.style.color = "white";
    root.style.float = "right";

    const button = document.createElement("button");
    button.className = "cm-struct-preset-autofill";
    button.innerHTML = ButtonIcon;
    button.style.color = ICON_COLOR;
    button.style.fill = "currentColor";
    button.style.width = "1.25rem";
    button.style.height = "1.25rem";
    button.style.display = "flex";
    button.style.justifyContent = "center";
    button.style.alignItems = "center";
    button.style.backgroundColor = "transparent";
    button.style.margin = "0";
    button.style.padding = "0px 3px 2px 4px";
    button.style.border = "none";
    button.style.borderRadius = "4px";

    const popup = document.createElement("div");
    popup.style.display = "none";
    popup.style.position = "absolute";
    popup.style.top = "100%";
    popup.style.right = "0";
    popup.style.zIndex = "1";
    popup.style.width = "fit-content";
    popup.style.height = "fit-content";
    popup.style.padding = "0";
    popup.style.whiteSpace = "nowrap";
    popup.style.backgroundColor = "#052d57";
    popup.style.borderRadius = "4px";
    popup.style.overflow = "hidden";
    popup.style.boxShadow =
      "0 5px 5px -3px rgb(0 0 0 / 20%), 0 8px 10px 1px rgb(0 0 0 / 14%), 0 3px 14px 2px rgb(0 0 0 / 12%)";
    popup.className = getPresetPopupClassName(this.id);

    const previewEl = document.createElement("div");
    previewEl.style.padding = "0";
    previewEl.style.display = "flex";
    previewEl.style.flexDirection = "column";
    previewEl.className = getPresetPreviewClassName(this.id);
    popup.appendChild(previewEl);

    const unorderedList = document.createElement("ul");
    unorderedList.style.listStyleType = "none";
    unorderedList.style.margin = "0";
    unorderedList.style.padding = "0";
    unorderedList.style.display = "flex";
    unorderedList.style.flexDirection = "column";
    unorderedList.style.alignItems = "stretch";
    unorderedList.style.maxHeight = "300px";
    unorderedList.style.overflowY = "auto";
    unorderedList.style.overscrollBehavior = "contain";

    const createOption = (
      option: Option,
      type: "li" | "div" = "li"
    ): HTMLElement => {
      const listItem = document.createElement(type);
      listItem.style.padding = "0";
      listItem.style.minWidth = "fit-content";
      listItem.style.height = "fit-content";
      listItem.style.display = "flex";
      const optionButton = document.createElement("button");
      if (option.label) {
        optionButton.textContent = option.label;
      }
      if (option.innerHTML) {
        optionButton.innerHTML = option.innerHTML;
      }
      optionButton.style.flex = "1";
      optionButton.style.fontFamily = "inherit";
      optionButton.style.fontSize = "inherit";
      optionButton.style.color = "inherit";
      optionButton.style.backgroundColor = DEFAULT_COLOR;
      optionButton.style.margin = "0";
      optionButton.style.padding = "8px 16px";
      optionButton.style.border = "none";
      optionButton.style.minWidth = "fit-content";
      optionButton.style.height = "fit-content";
      optionButton.style.transition = "background-color 0.15s";
      optionButton.style.textTransform = "uppercase";
      optionButton.onmouseenter = (): void => {
        optionButton.style.backgroundColor = HOVER_COLOR;
      };
      optionButton.onmouseleave = (): void => {
        optionButton.style.backgroundColor = DEFAULT_COLOR;
      };
      optionButton.onpointerup = (): void => {
        optionButton.style.backgroundColor = HOVER_COLOR;
      };
      optionButton.onclick = (e: PointerEvent): void => {
        option.onClick?.(e, previewEl);
      };
      listItem.appendChild(optionButton);
      return listItem;
    };
    if (this.options) {
      this.options.forEach((o) => unorderedList.appendChild(createOption(o)));
    }
    popup.appendChild(unorderedList);

    const closeListItem = createOption(
      {
        innerHTML: CheckIcon,
        onClick: () => {
          if (popup.style.display !== "none") {
            popup.style.display = "none";
          }
        },
      },
      "div"
    );
    closeListItem.style.borderTop = "1px solid #FFFFFF26";
    const closeButton = closeListItem.firstElementChild as HTMLElement;
    closeButton.style.color = "#99daff";
    closeButton.style.display = "flex";
    closeButton.style.justifyContent = "center";
    closeButton.style.alignItems = "center";
    const closeButtonIcon = closeButton.firstElementChild as HTMLElement;
    closeButtonIcon.style.height = "1rem";
    popup.appendChild(closeListItem);

    root.appendChild(button);
    root.appendChild(popup);

    button.onmouseenter = (): void => {
      if (popup.style.display !== "none") {
        button.style.backgroundColor = TAP_COLOR;
      } else {
        button.style.backgroundColor = HOVER_COLOR;
      }
    };
    button.onmouseleave = (): void => {
      if (popup.style.display !== "none") {
        button.style.backgroundColor = TAP_COLOR;
      } else {
        button.style.backgroundColor = DEFAULT_COLOR;
      }
    };
    button.onpointerdown = (e: MouseEvent): void => {
      e.stopImmediatePropagation();
      e.preventDefault();
      button.style.backgroundColor = TAP_COLOR;
    };
    button.onclick = (e: PointerEvent): void => {
      if (popup) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (popup.style.display !== "none") {
          popup.style.display = "none";
        } else {
          this.updatePreview?.();
          popup.style.display = "block";
          button.style.backgroundColor = TAP_COLOR;
        }
      }
    };
    return root;
  }

  override eq(other: StructPresetWidgetType): boolean {
    return this.id === other.id;
  }
}
