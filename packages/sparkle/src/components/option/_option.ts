import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./option.css";

export default spec({
  tag: "s-option",
  props: {
    type: null as string | null,
    href: null as string | null,
  },
  html: ({ props }) => {
    const { type, href } = props;
    const isLink = type === "a" || type === "link" || href;
    const isLabel = type === "label" || type === "file";
    const isDiv = type === "div" || type === "container";
    const isToggle = type === "toggle";
    const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
    const roleAttr = isToggle ? () => html`role="checkbox"` : "";
    return html`
    <${tag} class="root" part="root" ${roleAttr}>
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
    `;
  },
  selectors: {
    label: ".label",
    icon: ".icon",
    inactiveIcon: ".inactive-icon",
    activeIcon: ".active-icon",
    ripple: "s-ripple",
    badge: "s-badge",
  } as const,
  css: [...sharedCSS, css],
});
