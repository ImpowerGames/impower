import { WidgetType } from "@codemirror/view";

export class StructFieldValueWidgetType extends WidgetType {
  id: string;

  isDragging = false;

  override eq(other: StructFieldValueWidgetType): boolean {
    return this.id === other.id;
  }

  unregister?: () => void;

  onDragStart?: (id: string, dom: HTMLElement, startX: number) => void;

  onDragging?: (
    id: string,
    dom: HTMLElement,
    startX: number,
    x: number
  ) => void;

  onDragEnd?: (id: string, dom: HTMLElement, startX: number, x: number) => void;

  constructor(
    id: string,
    callbacks?: {
      onDragStart?: (id: string, dom: HTMLElement, startX: number) => void;
      onDragging?: (
        id: string,
        dom: HTMLElement,
        startX: number,
        x: number
      ) => void;
      onDragEnd?: (
        id: string,
        dom: HTMLElement,
        startX: number,
        x: number
      ) => void;
    }
  ) {
    super();
    this.id = id;
    this.onDragStart = callbacks?.onDragStart;
    this.onDragging = callbacks?.onDragging;
    this.onDragEnd = callbacks?.onDragEnd;
  }

  toDOM(): HTMLElement {
    const root = document.createElement("span");
    root.className = "cm-struct-field-widget";
    root.style.marginLeft = "8px";
    root.style.color = "white";
    root.style.float = "right";
    root.style.display = "flex";
    root.style.justifyContent = "center";
    root.style.alignItems = "center";
    root.style.width = "1.4rem";
    root.style.height = "1.4rem";
    const triangleLeft = document.createElement("div");
    triangleLeft.style.opacity = "0";
    triangleLeft.style.transition = "opacity 0.1s ease";
    triangleLeft.style.width = "6px";
    triangleLeft.style.height = "6px";
    triangleLeft.style.backgroundColor = "inherit";
    triangleLeft.style.position = "absolute";
    triangleLeft.style.left = "-10px";
    triangleLeft.style.clipPath = "polygon(50% 0, 100% 100%, 0 100%)";
    triangleLeft.style.transform = "rotate(-90deg)";
    triangleLeft.style.borderRadius = "2px";
    const triangleRight = document.createElement("div");
    triangleRight.style.opacity = "0";
    triangleRight.style.transition = "opacity 0.1s ease";
    triangleRight.style.width = "6px";
    triangleRight.style.height = "6px";
    triangleRight.style.backgroundColor = "inherit";
    triangleRight.style.position = "absolute";
    triangleRight.style.right = "-10px";
    triangleRight.style.clipPath = "polygon(50% 0, 100% 100%, 0 100%)";
    triangleRight.style.transform = "rotate(90deg)";
    triangleRight.style.borderRadius = "2px";
    const button = document.createElement("button");
    button.className = "cm-struct-field-widget-button";
    button.style.opacity = "0.5";
    button.style.backgroundColor = "#2B83B7";
    button.style.fill = "currentColor";
    button.style.width = "8px";
    button.style.height = "8px";
    button.style.display = "flex";
    button.style.justifyContent = "center";
    button.style.alignItems = "center";
    button.style.padding = "0";
    button.style.margin = "2px 8px 2px 4px";
    button.style.border = "none";
    button.style.transition = "transform 0.1s ease";
    button.style.cursor = "grab";
    button.style.borderRadius = "50%";
    button.style.position = "relative";
    let startX = 0;
    const onMouseMove = (event: MouseEvent): void => {
      if (this.isDragging) {
        const deltaX = event.clientX - startX;
        if (deltaX < 0) {
          triangleLeft.style.opacity = "1";
          triangleRight.style.opacity = "0.25";
        } else {
          triangleLeft.style.opacity = "0.25";
          triangleRight.style.opacity = "1";
        }
        this.onDragging?.(this.id, root, startX, event.clientX);
      }
    };
    const onMouseUp = (event: MouseEvent): void => {
      if (this.isDragging) {
        this.isDragging = false;
        this.onDragEnd?.(this.id, root, startX, event.clientX);
      }
      document.documentElement.style.cursor = null;
      button.style.cursor = "grab";
      button.style.opacity = "0.5";
      button.style.boxShadow = null;
      triangleLeft.style.opacity = "0";
      triangleRight.style.opacity = "0";
    };
    button.onmouseenter = (event: MouseEvent): void => {
      if (!event.buttons) {
        button.style.opacity = "1";
        button.style.boxShadow =
          "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)";
      }
    };
    button.onmouseleave = (event: MouseEvent): void => {
      if (!event.buttons) {
        button.style.opacity = "0.5";
        button.style.boxShadow = null;
      }
    };
    button.onmousedown = (event: MouseEvent): void => {
      this.isDragging = true;
      startX = event.clientX;
      button.style.cursor = "grabbing";
      triangleLeft.style.opacity = "0.5";
      triangleRight.style.opacity = "0.5";
      document.documentElement.style.cursor = "grabbing";
      document
        .querySelectorAll<HTMLButtonElement>(`.${button.className}`)
        .forEach((el) => {
          if (el !== button) {
            el.style.cursor = "grabbing";
          }
        });
      this.onDragStart?.(this.id, root, startX);
    };

    button.appendChild(triangleLeft);
    button.appendChild(triangleRight);

    root.appendChild(button);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    this.unregister = (): void => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    return root;
  }

  override destroy(dom: HTMLElement): void {
    this.unregister?.();
    super.destroy(dom);
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
