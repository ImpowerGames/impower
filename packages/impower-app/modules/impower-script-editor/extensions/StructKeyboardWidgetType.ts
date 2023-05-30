import { WidgetType } from "@codemirror/view";

const ICON_COLOR = "#2B83B7";
const DEFAULT_COLOR = "#00000000";
const HOVER_COLOR = "#00000040";
const TAP_COLOR = "#000000";

const ButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Pro 6.0.0-beta1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) --><path d="M512 64H64C28.8 64 0 92.8 0 128v256c0 35.2 28.8 64 64 64h448c35.2 0 64-28.8 64-64V128C576 92.8 547.2 64 512 64zM144 400H64c-8.837 0-16-7.163-16-16V224H128v80C128 312.9 135.1 320 144 320V400zM272 400h-96V320C184.9 320 192 312.9 192 304V224h64v80C256 312.9 263.1 320 272 320V400zM400 400h-96V320c8.875 0 16-7.125 16-16V224h64v80c0 8.875 7.125 16 16 16V400zM512 400h-80V320c8.875 0 16-7.125 16-16V224h80v160C528 392.8 520.8 400 512 400zM528 176h-480V128c0-8.837 7.163-16 16-16h448c8.837 0 16 7.163 16 16V176z"/></svg>`;

const STRUCT_keyboard_POPUP_CLASS_PREFIX = "cm-struct-keyboard-popup-";

const blackKeyNotes = ["", "C#", "D#", "", "", "F#", "G#", "A#", ""];

const whiteKeyNotes = ["C", "D", "E", "F", "G", "A", "B"];

const allNotes = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const getKeyboardPopupClassName = (id: string): string => {
  return `${STRUCT_keyboard_POPUP_CLASS_PREFIX}${id}`;
};

export class StructKeyboardWidgetType extends WidgetType {
  id: string;

  onKeyUp: (semitones: number) => void;

  onKeyDown: (semitones: number) => void;

  isPointerDown: boolean;

  onPointerDown = (): void => {
    this.isPointerDown = true;
  };

  onPointerUp = (): void => {
    this.isPointerDown = false;
  };

  constructor(
    id: string,
    onKeyDown: (semitones: number) => void,
    onKeyUp?: (semitones: number) => void
  ) {
    super();
    this.id = id;
    this.onKeyDown = onKeyDown;
    this.onKeyUp = onKeyUp;
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  override destroy(dom: HTMLElement): void {
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  toDOM(): HTMLElement {
    const root = document.createElement("span");
    root.className = "cm-struct-keyboard";
    root.style.position = "relative";
    root.style.marginLeft = "8px";
    root.style.color = "white";
    root.style.float = "right";

    const button = document.createElement("button");
    button.className = "cm-struct-keyboard-autofill";
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
    popup.style.userSelect = "none";
    popup.style.display = "none";
    popup.style.position = "absolute";
    popup.style.top = "100%";
    popup.style.right = "0";
    popup.style.zIndex = "1";
    popup.style.width = "224px";
    popup.style.height = "80px";
    popup.style.padding = "0";
    popup.style.whiteSpace = "nowrap";
    popup.style.backgroundColor = "#052d57";
    popup.style.borderRadius = "4px";
    popup.style.overflow = "hidden";
    popup.style.boxShadow =
      "0 5px 5px -3px rgb(0 0 0 / 20%), 0 8px 10px 1px rgb(0 0 0 / 14%), 0 3px 14px 2px rgb(0 0 0 / 12%)";
    popup.className = getKeyboardPopupClassName(this.id);

    const whiteKeyList = document.createElement("ul");
    whiteKeyList.style.pointerEvents = "none";
    whiteKeyList.style.listStyleType = "none";
    whiteKeyList.style.position = "absolute";
    whiteKeyList.style.top = "0";
    whiteKeyList.style.bottom = "0";
    whiteKeyList.style.left = "0";
    whiteKeyList.style.right = "0";
    whiteKeyList.style.margin = "0";
    whiteKeyList.style.padding = "0";
    whiteKeyList.style.display = "flex";
    whiteKeyList.style.alignItems = "stretch";
    whiteKeyList.style.maxHeight = "300px";
    whiteKeyList.style.overscrollBehavior = "contain";

    const blackKeyList = document.createElement("ul");
    blackKeyList.style.pointerEvents = "none";
    blackKeyList.style.listStyleType = "none";
    blackKeyList.style.position = "absolute";
    blackKeyList.style.top = "0";
    blackKeyList.style.bottom = "0";
    blackKeyList.style.left = "0";
    blackKeyList.style.right = "0";
    blackKeyList.style.margin = "0";
    blackKeyList.style.padding = "0";
    blackKeyList.style.display = "flex";
    blackKeyList.style.alignItems = "stretch";
    blackKeyList.style.maxHeight = "300px";
    blackKeyList.style.overscrollBehavior = "contain";

    const createOption = (
      key: string,
      textColor: string,
      backgroundColor: string,
      width: string,
      height: string
    ): HTMLElement => {
      const listItem = document.createElement("div");
      listItem.style.minWidth = "0";
      listItem.style.minWidth = width;
      listItem.style.maxWidth = width;
      listItem.style.height = height;
      listItem.style.padding = "1px";
      listItem.style.display = "flex";
      const optionButton = document.createElement("button");
      optionButton.style.pointerEvents = "auto";
      optionButton.style.position = "relative";
      optionButton.style.flex = "1";
      optionButton.style.display = "flex";
      optionButton.style.justifyContent = "center";
      optionButton.style.alignItems = "flex-end";
      optionButton.style.fontFamily = "inherit";
      optionButton.style.fontSize = "inherit";
      optionButton.style.color = "inherit";
      optionButton.style.backgroundColor = DEFAULT_COLOR;
      optionButton.style.margin = "0";
      optionButton.style.padding = "2px 0px";
      optionButton.style.border = "none";
      optionButton.style.height = "100%";
      optionButton.style.transition = "background-color 0.15s";
      optionButton.style.textTransform = "uppercase";
      optionButton.style.borderRadius = "2px";
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.bottom = "0";
      overlay.style.left = "0";
      overlay.style.right = "0";
      optionButton.appendChild(overlay);
      if (key) {
        const semitones = allNotes.indexOf(key);
        const span = document.createElement("span");
        span.textContent = key;
        span.style.position = "relative";
        optionButton.style.color = textColor;
        optionButton.style.backgroundColor = backgroundColor;
        optionButton.appendChild(span);
        optionButton.onmouseenter = (): void => {
          overlay.style.backgroundColor = HOVER_COLOR;
        };
        optionButton.onmouseleave = (): void => {
          overlay.style.backgroundColor = DEFAULT_COLOR;
          this.onKeyUp?.(semitones);
        };
        optionButton.onpointerup = (): void => {
          overlay.style.backgroundColor = HOVER_COLOR;
          this.onKeyUp?.(semitones);
        };
        optionButton.onpointerdown = (e): void => {
          e.preventDefault();
          this.onKeyDown?.(semitones);
        };
        optionButton.onpointerenter = (e): void => {
          e.preventDefault();
          if (this.isPointerDown) {
            this.onKeyDown?.(semitones);
          }
        };
      }
      listItem.appendChild(optionButton);
      return listItem;
    };
    whiteKeyNotes.forEach((o) =>
      whiteKeyList.appendChild(
        createOption(o, "#fff", "#2B83B7", "32px", "100%")
      )
    );
    blackKeyNotes.forEach((o) =>
      blackKeyList.appendChild(
        createOption(o, "#fff", "#001933", o ? "32px" : "16px", "55%")
      )
    );
    popup.appendChild(whiteKeyList);
    popup.appendChild(blackKeyList);

    // const closeListItem = createOption(
    //   {
    //     innerHTML: CheckIcon,
    //     onClick: () => {
    //       if (popup.style.display !== "none") {
    //         popup.style.display = "none";
    //       }
    //     },
    //   }
    // );
    // closeListItem.style.borderTop = "1px solid #FFFFFF26";
    // const closeButton = closeListItem.firstElementChild as HTMLElement;
    // closeButton.style.color = "#99daff";
    // closeButton.style.display = "flex";
    // closeButton.style.justifyContent = "center";
    // closeButton.style.alignItems = "center";
    // closeButton.style.padding = "8px 16px";
    // const closeButtonIcon = closeButton.firstElementChild as HTMLElement;
    // closeButtonIcon.style.height = "1rem";
    // popup.appendChild(closeListItem);

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
          popup.style.display = "block";
          button.style.backgroundColor = TAP_COLOR;
        }
      }
    };
    return root;
  }

  override eq(other: StructKeyboardWidgetType): boolean {
    return this.id === other.id;
  }
}
