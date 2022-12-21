import { WidgetType } from "@codemirror/view";

const STRUCT_FIELD_NAME_CLASS_PREFIX = "cm-struct-field-name-";

const STRUCT_FIELD_SLIDER_TRACK_CLASS_PREFIX = "cm-struct-field-slider-track";

const STRUCT_FIELD_SLIDER_FILL_CLASS_PREFIX = "cm-struct-field-slider-fill";

export class StructFieldNameWidgetType extends WidgetType {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }

  toDOM(): HTMLElement {
    const root = document.createElement("span");
    root.style.position = "relative";
    root.className = `${STRUCT_FIELD_NAME_CLASS_PREFIX}${this.id}`;
    const sliderTrack = document.createElement("div");
    sliderTrack.className = `${STRUCT_FIELD_SLIDER_TRACK_CLASS_PREFIX}${this.id}`;
    sliderTrack.style.height = "4px";
    sliderTrack.style.width = "200px";
    sliderTrack.style.position = "absolute";
    sliderTrack.style.bottom = "0";
    sliderTrack.style.left = "0";
    sliderTrack.style.backgroundColor = "#00000080";
    sliderTrack.style.borderRadius = "4px";
    sliderTrack.style.opacity = "0";
    sliderTrack.style.transition = "opacity 0.15s ease 0.15s";
    sliderTrack.style.overflow = "hidden";
    const sliderFill = document.createElement("div");
    sliderFill.className = `${STRUCT_FIELD_SLIDER_FILL_CLASS_PREFIX}${this.id}`;
    sliderFill.style.position = "absolute";
    sliderFill.style.top = "0";
    sliderFill.style.bottom = "0";
    sliderFill.style.left = "0";
    sliderFill.style.right = "0";
    sliderFill.style.transformOrigin = `left center`;
    sliderFill.style.backgroundColor = "#2B83B7";
    sliderTrack.appendChild(sliderFill);
    root.appendChild(sliderTrack);
    return root;
  }
}
