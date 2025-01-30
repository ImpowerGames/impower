import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./option.css";

export default spec({
  tag: "s-option",
  props: {
    type: null as string | null,
    href: null as string | null,
    disableRipple: false,
    icon: null as string | null,
    activeIcon: null as string | null,
  },
  html: ({ props }) => {
    const { type, href, icon, activeIcon, disableRipple } = props;
    const isLink = type === "a" || type === "link" || href;
    const isLabel = type === "label" || type === "file";
    const isDiv = type === "div" || type === "container";
    const isToggle = type === "toggle";
    const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
    const roleAttr = isToggle ? () => html`role="checkbox"` : "";
    const rippleAttr = disableRipple ? () => html`animation="none"` : "";
    const normalIconComponent = () =>
      icon
        ? html`<div class="normal-icon" part="normal-icon">
            <s-icon name="${icon}"></s-icon>
          </div>`
        : "";
    const activeIconComponent = () =>
      activeIcon
        ? html`<div class="active-icon" part="active-icon">
            <s-icon name="${activeIcon}"></s-icon>
          </div>`
        : "";
    return html`
    <${tag} class="root" part="root" ${roleAttr}>
    <slot name="before"></slot>
    <s-ripple class="ripple" part="ripple" ${rippleAttr}></s-ripple>
    <div class="icon" part="icon">
      ${normalIconComponent}
      ${activeIconComponent}
    </div>
    <slot class="label" part="label"></slot>
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
