import { WidgetType } from "@codemirror/view";

const BOOLEAN_ARRAY = [false, true];

const roundToNearestStep = (n: number, step: number): number => {
  return Math.round(n / step) * step;
};

const wrapString = (str: string): string => {
  const quote = str.includes('"') ? "`" : '"';
  return `${quote}${encodeURI(str)
    .replace(/%u/g, "\\u")
    .replace(/%U/g, "\\U")
    .replace(/%/g, "\\x")}${quote}`;
};

const getValueText = (value: unknown, step?: number): string => {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return wrapString(String(value));
  }
  if (typeof value === "number") {
    if (step !== undefined) {
      const stepFractionDigits = step.toString().split(".")[1]?.length;
      return value.toFixed(stepFractionDigits);
    }
    return value.toString();
  }
  return String(value);
};

const getNewValue = (
  min: number,
  max: number,
  step: number,
  startValue: number,
  deltaX: number
): number => {
  const newValue = roundToNearestStep((startValue || 0) + deltaX * step, step);
  if (newValue < min) {
    return min;
  }
  if (newValue > max) {
    return max;
  }
  return newValue;
};

export class StructFieldValueWidgetType extends WidgetType {
  id: string;

  valueContent: string;

  startValue: unknown;

  range: unknown[];

  isDragging = false;

  dom: HTMLElement;

  onDragStart?: (e: MouseEvent, dom: HTMLElement, startX: number) => void;

  onDragging?: (
    e: MouseEvent,
    dom: HTMLElement,
    startX: number,
    x: number
  ) => void;

  onDragEnd?: (
    e: MouseEvent,
    dom: HTMLElement,
    startX: number,
    x: number
  ) => void;

  constructor(
    id: string,
    valueContent: string,
    startValue: unknown,
    range: unknown[],
    callbacks?: {
      onDragStart?: (e: MouseEvent, dom: HTMLElement, startX: number) => void;
      onDragging?: (
        e: MouseEvent,
        dom: HTMLElement,
        startX: number,
        x: number
      ) => void;
      onDragEnd?: (
        e: MouseEvent,
        dom: HTMLElement,
        startX: number,
        x: number
      ) => void;
    }
  ) {
    super();
    this.id = id;
    this.valueContent = valueContent;
    this.startValue = startValue;
    this.range = range;
    this.onDragStart = callbacks?.onDragStart;
    this.onDragging = callbacks?.onDragging;
    this.onDragEnd = callbacks?.onDragEnd;
  }

  toDOM(): HTMLElement {
    const options = this.range || BOOLEAN_ARRAY;
    const min =
      typeof this.startValue === "number"
        ? (this.range?.[0] as number) ?? 0
        : 0;
    const max =
      typeof this.startValue === "number"
        ? (this.range?.[1] as number) ?? 100
        : options.length - 1;
    const step =
      typeof this.startValue === "number"
        ? (this.range?.[2] as number) ?? 1
        : 0.02;
    const start =
      typeof this.startValue === "number"
        ? this.startValue
        : options.indexOf(this.startValue);

    const root = document.createElement("span");
    root.style.position = "relative";
    const preview = document.createElement("div");
    preview.style.opacity = "0";
    preview.style.position = "absolute";
    preview.style.top = "0";
    preview.style.left = "0";
    preview.style.width = "fit-content";
    preview.style.whiteSpace = "nowrap";
    preview.style.color = "#99daff";
    preview.style.cursor = "ew-resize";
    preview.textContent = this.valueContent;
    root.appendChild(preview);

    let startX = 0;
    const onMouseMove = (event: MouseEvent): void => {
      event.stopImmediatePropagation();
      event.preventDefault();
      const deltaX = event.clientX - startX;
      const newValue = getNewValue(min, max, step, start, deltaX);
      const insert =
        typeof this.startValue === "number"
          ? getValueText(newValue, step)
          : getValueText(options[Math.floor(newValue)]);
      if (preview && insert !== preview.textContent) {
        preview.textContent = insert;
        preview.style.opacity = "1";
      }
      this.onDragging?.(event, preview, startX, event.clientX);
    };
    const onMouseUp = (event: MouseEvent): void => {
      this.onDragEnd?.(event, preview, startX, event.clientX);
      window.removeEventListener("mousemove", onMouseMove);
      document.documentElement.style.cursor = null;
      this.isDragging = false;
      this.onDragEnd?.(event, preview, startX, event.clientX);
    };
    preview.onmousedown = (event: MouseEvent): void => {
      this.isDragging = true;
      startX = event.clientX;
      document.documentElement.style.cursor = "ew-resize";
      event.stopImmediatePropagation();
      event.preventDefault();
      const valueEl = document.getElementsByClassName(
        this.id
      )?.[0] as HTMLElement;
      if (valueEl) {
        valueEl.style.opacity = "0";
      }
      if (preview) {
        preview.textContent = valueEl.textContent;
        preview.style.opacity = "1";
      }
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp, { once: true });
      this.onDragStart?.(event, preview, startX);
    };
    this.dom = root;
    return root;
  }

  override updateDOM(dom: HTMLElement): boolean {
    if (this.isDragging) {
      dom.firstElementChild.textContent =
        this.dom?.firstElementChild.textContent;
      const valueEl = document.getElementsByClassName(
        this.id
      )?.[0] as HTMLElement;
      if (valueEl) {
        valueEl.style.opacity = "0";
      }
      return true;
    }
    return false;
  }
}
