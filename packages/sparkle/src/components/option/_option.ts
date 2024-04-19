import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./option.css";

export default spec({
  tag: "s-option",
  props: {
    type: null as string | null,
    href: null as string | null,
    ripple: false,
    icon: null as string | null,
    activeIcon: null as string | null,
  },
  html: ({ props }) => {
    const { type, href, icon, activeIcon, ripple } = props;
    const isLink = type === "a" || type === "link" || href;
    const isLabel = type === "label" || type === "file";
    const isDiv = type === "div" || type === "container";
    const isToggle = type === "toggle";
    const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
    const roleAttr = isToggle ? () => html`role="checkbox"` : "";
    const iconName = icon;
    const activeIconName = activeIcon || icon;
    const rippleAttr = ripple ? "" : () => html`animation="none"`;
    const iconComponent = () =>
      iconName ? html`<s-icon name="${iconName}"></s-icon>` : "";
    const activeIconComponent = () =>
      activeIconName ? html`<s-icon name="${activeIconName}"></s-icon>` : "";
    return html`
    <${tag} class="root" part="root" ${roleAttr}>
    <slot name="before"></slot>
    <s-ripple class="ripple" part="ripple" ${rippleAttr}></s-ripple>
    <div class="icon" part="icon">
      <div class="inactive-icon" part="inactive-icon">${iconComponent}</div>
      <div class="active-icon" part="active-icon">${activeIconComponent}</div>
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
