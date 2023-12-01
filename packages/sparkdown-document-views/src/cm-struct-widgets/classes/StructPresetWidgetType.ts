import { WidgetType } from "@codemirror/view";

const ICON_COLOR = "#2B83B7";
const DEFAULT_COLOR = "#00000000";
const HOVER_COLOR = "#00000040";
const TAP_COLOR = "#000000";

const ButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></svg>`;

const CheckIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>`;

const STRUCT_PRESET_POPUP_CLASS_PREFIX = "cm-struct-preset-popup-";

const STRUCT_PRESET_PREVIEW_CLASS_PREFIX = "cm-struct-preset-preview-";

export const getPresetPopupClassName = (id: string): string => {
  return `${STRUCT_PRESET_POPUP_CLASS_PREFIX}${id}`;
};

export const getPresetPreviewClassName = (id: string): string => {
  return `${STRUCT_PRESET_PREVIEW_CLASS_PREFIX}${id}`;
};

export interface StructPresetOption {
  label?: string;
  innerHTML?: string;
  onClick?: (e: PointerEvent, previewEl: HTMLElement) => void;
}

export default class StructPresetWidgetType extends WidgetType {
  id: string;

  options?: StructPresetOption[] = [];

  updatePreview: (previewEl: HTMLElement) => void;

  constructor(
    id: string,
    options: StructPresetOption[],
    updatePreview: (previewEl: HTMLElement) => void
  ) {
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
    button.style.color = ICON_COLOR;
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
    button.style.cursor = "pointer";
    button.innerHTML = ButtonIcon;

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
      option: StructPresetOption,
      type: "li" | "div" = "li"
    ): HTMLElement => {
      const listItem = document.createElement(type);
      listItem.style.padding = "0";
      listItem.style.minWidth = "fit-content";
      listItem.style.height = "fit-content";
      listItem.style.display = "flex";
      const optionButton = document.createElement("button");
      optionButton.style.position = "relative";
      optionButton.style.flex = "1";
      optionButton.style.display = "flex";
      optionButton.style.justifyContent = "center";
      optionButton.style.fontFamily = "inherit";
      optionButton.style.fontSize = "inherit";
      optionButton.style.color = "inherit";
      optionButton.style.backgroundColor = DEFAULT_COLOR;
      optionButton.style.margin = "0";
      optionButton.style.border = "none";
      optionButton.style.minWidth = "fit-content";
      optionButton.style.height = "fit-content";
      optionButton.style.transition = "background-color 0.15s";
      optionButton.style.textTransform = "uppercase";
      optionButton.style.cursor = "pointer";
      if (option.innerHTML) {
        optionButton.innerHTML = option.innerHTML;
        optionButton.style.padding = "0";
      }
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.bottom = "0";
      overlay.style.left = "0";
      overlay.style.right = "0";
      optionButton.appendChild(overlay);
      if (option.label) {
        const span = document.createElement("span");
        span.textContent = option.label;
        span.style.position = "relative";
        optionButton.appendChild(span);
        optionButton.style.padding = "8px 16px";
      }
      optionButton.onmouseenter = (): void => {
        overlay.style.backgroundColor = HOVER_COLOR;
      };
      optionButton.onmouseleave = (): void => {
        overlay.style.backgroundColor = DEFAULT_COLOR;
      };
      optionButton.onpointerup = (): void => {
        overlay.style.backgroundColor = HOVER_COLOR;
      };
      optionButton.onclick = (e: MouseEvent): void => {
        option.onClick?.(e as PointerEvent, previewEl);
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
    closeButton.style.padding = "8px 16px";
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
    button.onclick = (e: MouseEvent): void => {
      if (popup) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (popup.style.display !== "none") {
          popup.style.display = "none";
        } else {
          this.updatePreview?.(previewEl);
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
