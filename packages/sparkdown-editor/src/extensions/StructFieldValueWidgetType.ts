import { WidgetType } from "@codemirror/view";

const BOOLEAN_ARRAY = [false, true];

const CLICK_THRESHOLD = 0;

const STRUCT_FIELD_CLASS_PREFIX = "cm-struct-field";

const STRUCT_FIELD_VALUE_PREVIEW_CLASS_PREFIX = "cm-struct-field-value-preview";

const STRUCT_FIELD_SLIDER_TRACK_CLASS_PREFIX = "cm-struct-field-slider-track";

const STRUCT_FIELD_SLIDER_FILL_CLASS_PREFIX = "cm-struct-field-slider-fill";

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
      const stepFractionDigits = step.toString().split(".")[1]?.length || 0;
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

const getElement = (className: string): HTMLElement => {
  const elements = document.getElementsByClassName(className);
  return elements?.[elements.length - 1] as HTMLElement;
};

export class StructFieldValueWidgetType extends WidgetType {
  id: string;

  valueContent: string;

  startValue: unknown;

  range: unknown[];

  isDragging = false;

  dom: HTMLElement;

  onDragStart?: (e: MouseEvent, startX: number) => void;

  onDragging?: (
    e: MouseEvent,
    startX: number,
    x: number,
    previewTextContent: string | undefined
  ) => void;

  onDragEnd?: (
    e: MouseEvent,
    startX: number,
    x: number,
    previewTextContent: string | undefined
  ) => void;

  onClick?: (e: MouseEvent) => void;

  constructor(
    id: string,
    valueContent: string,
    startValue: unknown,
    range: unknown[],
    callbacks?: {
      onDragStart?: (e: MouseEvent, startX: number) => void;
      onDragging?: (
        e: MouseEvent,
        startX: number,
        x: number,
        previewTextContent: string | undefined
      ) => void;
      onDragEnd?: (
        e: MouseEvent,
        startX: number,
        x: number,
        previewTextContent: string | undefined
      ) => void;
      onClick?: (e: MouseEvent) => void;
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
    this.onClick = callbacks?.onClick;
  }

  toDOM(): HTMLElement {
    const className = `${STRUCT_FIELD_CLASS_PREFIX}${this.id}`;
    const sliderTrackClassName = `${STRUCT_FIELD_SLIDER_TRACK_CLASS_PREFIX}${this.id}`;
    const sliderFillClassName = `${STRUCT_FIELD_SLIDER_FILL_CLASS_PREFIX}${this.id}`;
    const previewClassName = `${STRUCT_FIELD_VALUE_PREVIEW_CLASS_PREFIX}${this.id}`;
    const minNumber =
      typeof this.startValue === "number"
        ? (this.range?.[1] as number) ?? 0
        : undefined;
    const maxNumber =
      typeof this.startValue === "number"
        ? (this.range?.[2] as number) ?? 100
        : undefined;
    const options =
      typeof this.startValue === "number"
        ? [minNumber, ((minNumber ?? 0) + (maxNumber ?? 0)) / 2, maxNumber]
        : Array.isArray(this.range)
        ? this.range
        : BOOLEAN_ARRAY;
    const min = minNumber ?? 0;
    const max = maxNumber ?? options.length - 1;
    const step =
      typeof this.startValue === "number"
        ? (this.range?.[0] as number) ?? 1
        : 0.05;
    const start =
      typeof this.startValue === "number"
        ? this.startValue
        : options.indexOf(this.startValue);
    const startIndex = options.indexOf(this.startValue);
    const maxIndex = options.length - 1;
    const zeroOrigin =
      min >= 0 ? 0 : Math.abs(min) / (Math.abs(min) + Math.abs(max));

    const root = document.createElement("span");
    root.className = className;
    root.style.position = "relative";
    const preview = document.createElement("div");
    preview.className = previewClassName;
    preview.style.opacity = "0";
    preview.style.position = "absolute";
    preview.style.top = "0";
    preview.style.left = "0";
    preview.style.bottom = "4px";
    preview.style.width = "fit-content";
    preview.style.whiteSpace = "nowrap";
    preview.style.color = "#99daff";
    preview.style.cursor = "ew-resize";
    preview.style.backgroundColor = "black";
    preview.style.marginLeft = "-4px";
    preview.style.marginRight = "-4px";
    preview.style.paddingLeft = "4px";
    preview.style.paddingRight = "4px";
    preview.style.borderRadius = "2px";
    preview.textContent = this.valueContent;
    root.appendChild(preview);

    let startX = 0;
    let clicked = true;
    const onMouseMove = (event: MouseEvent): void => {
      const previewEl = getElement(previewClassName);
      const valueEl = getElement(this.id);
      const sliderTrackEl = getElement(sliderTrackClassName);
      const sliderFillEl = getElement(sliderFillClassName);

      event.stopImmediatePropagation();
      event.preventDefault();
      const deltaX = event.clientX - startX;
      if (Math.abs(deltaX) > CLICK_THRESHOLD) {
        clicked = false;
        const newValue = getNewValue(min, max, step, start, deltaX);
        const roundedValue =
          typeof this.startValue === "number" ? newValue : Math.floor(newValue);
        const insert =
          typeof this.startValue === "number"
            ? getValueText(roundedValue, step)
            : getValueText(options[roundedValue]);
        if (previewEl && insert !== previewEl.textContent) {
          previewEl.textContent = insert;
          previewEl.style.opacity = "1";
        }
        if (valueEl) {
          valueEl.style.opacity = "0";
        }
        if (sliderTrackEl) {
          sliderTrackEl.style.opacity = "1";
        }
        if (sliderFillEl) {
          sliderFillEl.style.left = `${zeroOrigin * 100}%`;
          if (min < 0) {
            if (roundedValue < 0) {
              sliderFillEl.style.transform = `scaleX(${
                roundedValue / Math.abs(min)
              })`;
            } else {
              sliderFillEl.style.transform = `scaleX(${
                roundedValue / Math.abs(max)
              })`;
            }
          } else {
            sliderFillEl.style.transformOrigin = `left center`;
            sliderFillEl.style.transform = `scaleX(${
              (roundedValue - min) / (max - min)
            })`;
          }
        }
        this.onDragging?.(
          event,
          startX,
          event.clientX,
          previewEl.textContent ?? undefined
        );
      }
    };
    const onMouseUp = (event: MouseEvent): void => {
      const previewEl = getElement(previewClassName);
      const valueEl = getElement(this.id);
      const sliderTrackEl = getElement(sliderTrackClassName);
      const sliderFillEl = getElement(sliderFillClassName);
      if (
        clicked &&
        valueEl.contains(event.target as Node) &&
        typeof this.startValue === "boolean"
      ) {
        // If clicked without dragging, toggle boolean
        const newIndex = startIndex >= maxIndex ? 0 : startIndex + 1;
        const newValue = options[newIndex];
        const insert = getValueText(newValue, step);
        if (previewEl && insert !== previewEl.textContent) {
          previewEl.textContent = insert;
        }
        if (sliderFillEl) {
          sliderFillEl.style.left = `${zeroOrigin * 100}%`;
          if (typeof newValue === "number" && min < 0) {
            if (newValue < 0) {
              sliderFillEl.style.transform = `scaleX(${
                newValue / Math.abs(min)
              })`;
            } else {
              sliderFillEl.style.transform = `scaleX(${
                newValue / Math.abs(max)
              })`;
            }
          } else {
            sliderFillEl.style.transform = `scaleX(${newIndex / maxIndex})`;
          }
        }
        this.onClick?.(event);
      }
      if (previewEl) {
        previewEl.style.opacity = "0";
      }
      if (sliderTrackEl) {
        sliderTrackEl.style.opacity = "0";
      }
      this.onDragEnd?.(
        event,
        startX,
        event.clientX,
        previewEl.textContent ?? undefined
      );
      window.removeEventListener("mousemove", onMouseMove);
      document.documentElement.style.cursor = "";
      this.isDragging = false;
    };
    preview.onmousedown = (event: MouseEvent): void => {
      const previewEl = getElement(previewClassName);
      const valueEl = getElement(this.id);
      const sliderTrackEl = getElement(sliderTrackClassName);
      const sliderFillEl = getElement(sliderFillClassName);

      this.isDragging = true;
      startX = event.clientX;
      document.documentElement.style.cursor = "ew-resize";
      event.stopImmediatePropagation();
      event.preventDefault();
      if (valueEl) {
        valueEl.style.opacity = "0";
      }
      if (previewEl) {
        previewEl.textContent = valueEl.textContent;
        previewEl.style.opacity = "1";
      }
      if (sliderTrackEl) {
        sliderTrackEl.style.opacity = "1";
      }
      if (sliderFillEl) {
        sliderFillEl.style.left = `${zeroOrigin * 100}%`;
        if (min < 0) {
          if (start < 0) {
            sliderFillEl.style.transform = `scaleX(${start / Math.abs(min)})`;
          } else {
            sliderFillEl.style.transform = `scaleX(${start / Math.abs(max)})`;
          }
        } else {
          sliderFillEl.style.transform = `scaleX(${startIndex / maxIndex})`;
        }
      }
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp, { once: true });
      this.onDragStart?.(event, startX);
    };
    this.dom = root;
    return root;
  }

  override eq(other: StructFieldValueWidgetType): boolean {
    const valueEl = getElement(this.id);
    if (this.isDragging || other.isDragging) {
      valueEl.style.opacity = "0";
    }
    if (this.id === other.id && this.startValue === other.startValue) {
      return true;
    }
    return false;
  }
}
