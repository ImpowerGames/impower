import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./button.css";

export default spec({
  tag: "s-button",
  props: {
    type: null as string | null,
    href: null as string | null,
    accept: null as string | null,
    multiple: null as string | null,
  },
  html: ({ props }) => {
    const { type, href, accept, multiple } = props;
    const isLink = type === "a" || type === "link" || href;
    const isLabel = type === "label" || type === "file";
    const isDiv = type === "div" || type === "container";
    const isToggle = type === "toggle";
    const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
    return html`
    <${tag} class="root" part="root" ${isToggle ? `role="checkbox"` : ""}>
    <slot name="before"></slot>
    <div class="ripple" part="ripple">
      <slot name="ripple">
        <s-ripple id="ripple"></s-ripple>
      </slot>
    </div>
    <div class="icon" part="icon">
      <div class="inactive-icon" part="inactive-icon"></div>
      <div class="active-icon" part="active-icon"></div>
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
        ? () => html`
            <input
              id="input"
              type="${type}"
              ${accept ? `accept="${accept}"` : ""}
              ${multiple != null ? `multiple` : ""}
            />
          `
        : ""
    }
    <slot name="after"></slot>
  </${tag}>
    `;
  },
  selectors: {
    input: null,
    ripple: "s-ripple",
    badge: "s-badge",
    icon: ".icon",
    label: ".label",
    spinner: ".spinner",
  } as const,
  css: [...sharedCSS, css],
});
