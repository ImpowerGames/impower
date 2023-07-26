import { html } from "../../../../spark-element/src/utils/html";
import css from "./button.css";

export default (state?: {
  attrs?: {
    type: string | null;
    href: string | null;
    accept: string | null;
    multiple: string | null;
  };
}) => {
  const type = state?.attrs?.type;
  const href = state?.attrs?.href;
  const accept = state?.attrs?.accept;
  const multiple = state?.attrs?.multiple;
  const isLink = type === "a" || type === "link" || href;
  const isLabel = type === "label" || type === "file";
  const isDiv = type === "div" || type === "container";
  const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
  return {
    css,
    html: html`
      <${tag} class="root" part="root">
        <slot name="before"></slot>
        <div class="ripple" part="ripple">
          <slot name="ripple">
            <s-ripple></s-ripple>
          </slot>
        </div>
        <div class="icon" part="icon">
          <slot name="icon">
            <s-icon></s-icon>
          </slot>
        </div>
        <div class="label" part="label">
          <slot></slot>
        </div>
        <div class="spinner" part="spinner" aria-busy="true" aria-live="polite">
          <slot name="spinner">
            <s-progress-circle></s-progress-circle>
          </slot>
        </div>
        ${
          type === "file"
            ? html`
                <input
                  type="${type}"
                  ${accept ? `accept="${accept}"` : ""}
                  ${multiple != null ? `multiple` : ""}
                />
              `
            : ""
        }
        <slot name="after"></slot>
      </${tag}>
  `,
  };
};
