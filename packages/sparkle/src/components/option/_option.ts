import { html } from "../../../../spark-element/src/utils/html";
import css from "./option.css";

export default (state?: {
  attrs?: {
    type: string | null;
    href: string | null;
  };
}) => {
  const type = state?.attrs?.type;
  const href = state?.attrs?.href;
  const isLink = type === "a" || type === "link" || href;
  const isLabel = type === "label" || type === "file";
  const isDiv = type === "div" || type === "container";
  const isToggle = type === "toggle";
  const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
  return {
    css,
    html: html`
      <${tag} class="root" part="root" ${isToggle ? `role="checkbox"` : ""}>
        <slot name="before"></slot>
        <div class="ripple" part="ripple">
          <slot name="ripple">
            <s-ripple></s-ripple>
          </slot>
        </div>
        <div class="icon" part="icon">
          <div class="inactive-icon" part="inactive-icon"></div>
          <div class="active-icon" part="active-icon"></div>
        </div>
        <div class="label" part="label">
          <slot></slot>
        </div>
        <slot name="after"></slot>
      </${tag}>
  `,
  };
};
